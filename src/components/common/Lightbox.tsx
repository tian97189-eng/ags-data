import { useEffect, useRef, useState } from 'react';

/**
 * 图片全屏查看器：点击缩略图全屏展示，滚轮/按钮缩放，ESC/点击关闭。
 * 纯查看组件，不影响外层逻辑。
 */
export default function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setScale(1);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setScale((s) => Math.min(4, s + 0.25));
      if (e.key === '-') setScale((s) => Math.max(0.5, s - 0.25));
      if (e.key === '0') setScale(1);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale((s) => Math.min(4, Math.max(0.5, s + (e.deltaY < 0 ? 0.15 : -0.15))));
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('wheel', onWheel);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/85 flex flex-col items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute top-3 right-3 flex items-center gap-2 text-white text-[12px]">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setScale((s) => Math.max(0.5, s - 0.25));
          }}
          className="w-8 h-8 rounded bg-white/10 hover:bg-white/25"
        >
          −
        </button>
        <span className="tabular-nums w-10 text-center">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setScale((s) => Math.min(4, s + 0.25));
          }}
          className="w-8 h-8 rounded bg-white/10 hover:bg-white/25"
        >
          +
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="w-8 h-8 rounded bg-white/10 hover:bg-white/25 ml-1"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>
      <img
        ref={imgRef}
        src={src}
        alt={alt ?? ''}
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-[90vh] object-contain transition-transform duration-150 select-none"
        style={{ transform: `scale(${scale})` }}
      />
      <div className="absolute bottom-4 text-[11px] text-white/50">
        {alt ?? '点击图片外关闭 · 滚轮缩放 · ESC 退出'}
      </div>
    </div>
  );
}
