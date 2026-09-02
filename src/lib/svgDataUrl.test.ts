import { describe, it, expect } from 'vitest';
import { extractSvgText } from './svgDataUrl';

describe('extractSvgText', () => {
  it('解码 base64 dataURL', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const b64 = btoa(unescape(encodeURIComponent(svg)));
    const url = `data:image/svg+xml;base64,${b64}`;
    expect(extractSvgText(url)).toBe(svg);
  });

  it('解码 utf8 percent-encoded dataURL', () => {
    const svg = '<svg><text>中文测试</text></svg>';
    const url = 'data:image/svg+xml,' + encodeURIComponent(svg);
    expect(extractSvgText(url)).toBe(svg);
  });

  it('未知格式返回 null（不抛错）', () => {
    expect(extractSvgText('http://example.com/xxx.svg')).toBeNull();
    expect(extractSvgText('data:image/png;base64,xxx')).toBeNull();
  });

  it('base64 解码失败（坏 base64）返回 null', () => {
    const url = 'data:image/svg+xml;base64,!!!not-base64!!!';
    expect(extractSvgText(url)).toBeNull();
  });
});
