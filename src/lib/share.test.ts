import { beforeEach, describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  writeFile: vi.fn(),
  share: vi.fn(),
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: mocks.writeFile },
  Directory: { Documents: 'DOCUMENTS' },
  Encoding: { UTF8: 'utf8', BASE64: 'BASE64' },
}));
vi.mock('@capacitor/share', () => ({
  Share: { share: mocks.share },
}));

import { saveAndShare } from './share';

beforeEach(() => {
  mocks.writeFile.mockReset();
  mocks.share.mockReset();
  mocks.writeFile.mockResolvedValue({ uri: 'file:///docs/test.json' });
  mocks.share.mockResolvedValue(undefined);
  // 默认不在原生平台
  delete (window as any).Capacitor;
});

describe('saveAndShare', () => {
  it('Web 端（无 Capacitor）触发 a.click() 下载', async () => {
    const clickMock = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click: clickMock } as any;
      }
      return document.createElement(tag);
    });

    const res = await saveAndShare({ filename: 'test.json', content: '{}', mime: 'application/json' });

    expect(res.method).toBe('web');
    expect(res.ok).toBe(true);
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.share).not.toHaveBeenCalled();
    createElementSpy.mockRestore();
  });

  it('原生端（Capacitor）调用 Filesystem.writeFile + Share.share', async () => {
    (window as any).Capacitor = { isNativePlatform: () => true };

    const res = await saveAndShare({ filename: 'backup.json', content: '{"a":1}' });

    expect(res.method).toBe('native');
    expect(res.ok).toBe(true);
    expect(res.uri).toBe('file:///docs/test.json');
    expect(mocks.writeFile).toHaveBeenCalledTimes(1);
    const writeArgs = mocks.writeFile.mock.calls[0][0];
    expect(writeArgs.path).toBe('backup.json');
    expect(writeArgs.data).toBe('{"a":1}');
    expect(writeArgs.directory).toBe('DOCUMENTS');
    expect(mocks.share).toHaveBeenCalledTimes(1);
    const shareArgs = mocks.share.mock.calls[0][0];
    expect(shareArgs.url).toBe('file:///docs/test.json');
    expect(shareArgs.title).toBe('backup.json');
  });

  it('Capacitor.isNativePlatform 存在但返回 false → 走 Web 分支', async () => {
    (window as any).Capacitor = { isNativePlatform: () => false };
    const clickMock = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click: clickMock } as any;
      }
      return document.createElement(tag);
    });

    const res = await saveAndShare({ filename: 'x.json', content: '' });
    expect(res.method).toBe('web');
    expect(clickMock).toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    createElementSpy.mockRestore();
  });

  it('base64 编码（原生）：Filesystem 写入时不再是 UTF8', async () => {
    (window as any).Capacitor = { isNativePlatform: () => true };
    mocks.writeFile.mockResolvedValue({ uri: 'file:///docs/data.xlsx' });
    const b64 = 'UEsDBAoAAAAAAAAAIQAFAAAAJAAAAHRlc3R4bWw=';
    const res = await saveAndShare({
      filename: 'data.xlsx',
      content: b64,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      encoding: 'base64',
    });
    expect(res.method).toBe('native');
    const writeArgs = mocks.writeFile.mock.calls[0][0];
    expect(writeArgs.data).toBe(b64);
    expect(writeArgs.encoding).not.toBe('UTF8');
  });

  it('base64 编码（Web）：把 base64 转成二进制 Blob 下载', async () => {
    delete (window as any).Capacitor;
    const clickMock = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click: clickMock } as any;
      }
      return document.createElement(tag);
    });
    const createdBlobs: Blob[] = [];
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn((obj: Blob | MediaSource) => {
      if (obj instanceof Blob) createdBlobs.push(obj);
      return 'blob:mock';
    }) as typeof URL.createObjectURL;

    // 含空字节的二进制，验证 Blob 转换正确
    const binary = 'hello\x00\x01world';
    const b64 = btoa(binary);
    await saveAndShare({
      filename: 'data.xlsx',
      content: b64,
      encoding: 'base64',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    expect(clickMock).toHaveBeenCalled();
    expect(createdBlobs.length).toBeGreaterThan(0);
    expect(createdBlobs[0].type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(createdBlobs[0].size).toBe(binary.length);

    URL.createObjectURL = origCreate;
    createElementSpy.mockRestore();
  });
});