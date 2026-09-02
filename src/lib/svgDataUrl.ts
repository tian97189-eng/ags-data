/**
 * 从 echarts svg renderer 返回的 dataURL 解码出原始 SVG 文本。
 * 返回 null 表示格式无法识别（调用方应提示用户）。
 *
 * echarts 的 SVG dataURL 形如：
 *   - `data:image/svg+xml;base64,<base64>`（默认）
 *   - `data:image/svg+xml;utf8,<urlencoded>`（部分版本）
 *
 * 非 svg 格式直接返回 null（避免 atob 对乱码的宽容导致误解码）。
 */
export function extractSvgText(dataUrl: string): string | null {
  if (dataUrl.startsWith('data:image/svg+xml;base64,')) {
    try {
      return atob(dataUrl.slice('data:image/svg+xml;base64,'.length));
    } catch {
      return null;
    }
  }
  if (dataUrl.startsWith('data:image/svg+xml,')) {
    try {
      return decodeURIComponent(dataUrl.slice('data:image/svg+xml,'.length));
    } catch {
      return null;
    }
  }
  return null;
}
