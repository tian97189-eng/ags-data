/**
 * 跨平台保存/分享文件：手机 APK（Capacitor）用 Filesystem + Share 系统面板，
 * Web 端维持 a.click() 下载。对用户透明，根据运行时自动选择。
 */
export type SaveResult = { ok: boolean; method: 'native' | 'web'; uri?: string };

export interface SaveOptions {
  filename: string;
  content: string;
  mime?: string;
  /** 原生端 Filesystem 写入的编码。文本传 utf8（默认），二进制（如 xlsx base64）传 base64 */
  encoding?: 'utf8' | 'base64';
}

export async function saveAndShare(opts: SaveOptions): Promise<SaveResult> {
  const win = window as any;
  if (win.Capacitor?.isNativePlatform?.()) {
    // —— 原生（APK）：写文件到 Documents 目录，再调系统分享面板 ——
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const enc = opts.encoding === 'base64' ? Encoding.Base64 : Encoding.UTF8;
    const res = await Filesystem.writeFile({
      path: opts.filename,
      data: opts.content,
      directory: Directory.Documents,
      encoding: enc,
      recursive: true,
    });
    await Share.share({
      title: opts.filename,
      text: `AGS 导出：${opts.filename}`,
      url: res.uri,
      dialogTitle: '保存文件',
    });
    return { ok: true, method: 'native', uri: res.uri };
  }

  // —— Web：浏览器下载 ——
  let blob: Blob;
  if (opts.encoding === 'base64') {
    // base64 → 二进制 → Blob
    const bytes = Uint8Array.from(atob(opts.content), (c) => c.charCodeAt(0));
    blob = new Blob([bytes], { type: opts.mime ?? 'application/octet-stream' });
  } else {
    blob = new Blob([opts.content], { type: opts.mime ?? 'application/octet-stream' });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = opts.filename;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true, method: 'web' };
}