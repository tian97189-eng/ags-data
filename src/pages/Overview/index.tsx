import { useEffect, useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';

/**
 * 今日概览（非实验数据）：日期 · 天气 · 一言 · 倒计时 · 快捷笔记。
 * 数据存 localStorage，天气从 Open-Meteo 公开 API 拉（无需 key）。
 */

const NOTES_KEY = 'overview.notes.v1';
const COUNTDOWN_KEY = 'overview.countdown.v1';

// —— 一言库 ——（每天按日期种子稳定选一句，避免每次刷新跳字）
export const QUOTES = [
  '把今天做好，就是对未来最好的交代。',
  '慢慢来，比较快。',
  '所谓坚持，是把一件普通的事做得很不普通。',
  '你不必很厉害才能开始，你要开始才能很厉害。',
  '不是因为有希望才坚持，而是因为坚持才有希望。',
  '所有看似平凡的日子，都在悄悄塑造着你。',
  '把每一件小事认真做，就已经很了不起了。',
  '不要等所有条件都准备好，先把手弄脏。',
  '今天能解决的问题，不要留给明天。',
  '休息也是向前走的一种方式。',
  '走最慢的人，只要不丢失目标，也比漫无目的徘徊的人走得快。',
  '做一颗种子，先扎根，再等春天。',
  '难走的路，往往才是该走的路。',
  '比起瞬间的爆发，持之以恒才更有力量。',
  '时间看得见 —— 你浇在哪里，它就长在哪里。',
  '慢慢积累，悄悄厉害。',
  '做让未来的自己会感谢的事。',
  '别急，答案会慢慢浮现。',
  '看不清未来时，就把它交给时间。',
  '善待每一段安静努力的时光。',
  '稳，比快更重要。',
  '向着光亮那方，哪怕一点点也好。',
  '不一定要赢，但要值得。',
  '把焦虑写成计划，把计划走成日子。',
  '今天读了多少书、做了多少事，自己知道就好。',
  '认真生活的人，生活也会认真回应。',
  '你现在的积累，都会在某一天开花。',
  '最重要的不是位置，而是方向。',
  '生活不在别处，就在此刻。',
  '种一棵树最好的时间是十年前，其次是现在。',
];
export function pickQuote(dateStr: string): string {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) h = (h * 31 + dateStr.charCodeAt(i)) >>> 0;
  return QUOTES[h % QUOTES.length];
}

// —— WMO weather code → 中文 + emoji ——（Open-Meteo 标准）
type Weather = { text: string; emoji: string };
const WMO: Record<number, Weather> = {
  0: { text: '晴', emoji: '☀️' },
  1: { text: '大致晴', emoji: '🌤️' },
  2: { text: '局部多云', emoji: '⛅' },
  3: { text: '阴', emoji: '☁️' },
  45: { text: '雾', emoji: '🌫️' },
  48: { text: '冻雾', emoji: '🌫️' },
  51: { text: '小毛毛雨', emoji: '🌦️' },
  53: { text: '毛毛雨', emoji: '🌦️' },
  55: { text: '大毛毛雨', emoji: '🌧️' },
  61: { text: '小雨', emoji: '🌦️' },
  63: { text: '中雨', emoji: '🌧️' },
  65: { text: '大雨', emoji: '🌧️' },
  71: { text: '小雪', emoji: '🌨️' },
  73: { text: '中雪', emoji: '❄️' },
  75: { text: '大雪', emoji: '❄️' },
  77: { text: '雪粒', emoji: '🌨️' },
  80: { text: '小阵雨', emoji: '🌦️' },
  81: { text: '阵雨', emoji: '🌧️' },
  82: { text: '强阵雨', emoji: '⛈️' },
  85: { text: '小阵雪', emoji: '🌨️' },
  86: { text: '阵雪', emoji: '❄️' },
  95: { text: '雷雨', emoji: '⛈️' },
  96: { text: '雷雨夹冰雹', emoji: '⛈️' },
  99: { text: '强雷雨夹冰雹', emoji: '⛈️' },
};

const FESTIVALS: Record<string, string> = {
  '01-01': '元旦',
  '02-14': '情人节',
  '03-08': '妇女节',
  '03-12': '植树节',
  '04-01': '愚人节',
  '05-01': '劳动节',
  '05-04': '青年节',
  '06-01': '儿童节',
  '09-10': '教师节',
  '10-01': '国庆节',
  '10-31': '万圣节前夜',
  '12-24': '平安夜',
  '12-25': '圣诞节',
};

/** 把 Date 安全格式化：yyyy-MM-dd */
function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 今天距指定日还有多少天（负数=已过） */
function daysUntil(target: string): number {
  const t = new Date(target + 'T00:00:00');
  const now = new Date(fmt(new Date()) + 'T00:00:00');
  const ms = t.getTime() - now.getTime();
  return Math.round(ms / 86_400_000);
}

interface WeatherInfo {
  temp: number;
  code: number;
  humidity: number;
  wind: number;
  city: string;
}

export default function OverviewPage() {
  const todayStr = fmt(new Date());
  const todayObj = new Date();
  const quote = useMemo(() => pickQuote(todayStr), [todayStr]);

  // —— 笔记 / 倒计时（localStorage）——
  const [note, setNote] = useState<string>(() => localStorage.getItem(NOTES_KEY) ?? '');
  interface CdItem { id: string; label: string; date: string }
  const [countdowns, setCountdowns] = useState<CdItem[]>(() => {
    const raw = localStorage.getItem(COUNTDOWN_KEY);
    if (!raw) return [];
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v.filter((x) => x && typeof x.label === 'string' && typeof x.date === 'string');
      if (v && typeof v.label === 'string' && typeof v.date === 'string') {
        return [{ id: 'legacy', label: v.label, date: v.date }];
      }
    } catch { /* ignore */ }
    return [];
  });
  useEffect(() => {
    localStorage.setItem(COUNTDOWN_KEY, JSON.stringify(countdowns));
  }, [countdowns]);
  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(NOTES_KEY, note), 300);
    return () => clearTimeout(t);
  }, [note]);
  function addOrUpdateCountdown(id: string | null, label: string, date: string) {
    const trimmed = label.trim();
    if (!trimmed || !date) return;
    setCountdowns((prev) => {
      if (id) return prev.map((c) => (c.id === id ? { ...c, label: trimmed, date } : c));
      return [...prev, { id: String(Date.now() + Math.random()), label: trimmed, date }];
    });
  }
  function deleteCountdown(id: string) {
    setCountdowns((prev) => prev.filter((c) => c.id !== id));
  }

  // —— 农历 + 节日 ——（localStorage 缓存 + 月内复用）
  const lunarText = useMemo<string>(() => {
    try {
      // 现代浏览器支持 zh-CN-u-ca-chinese
      return new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(todayObj).replace(/^[^年]*年/, '').replace(/月/g, '月');
    } catch {
      return '';
    }
  }, [todayStr]);

  const festival = FESTIVALS[todayStr.slice(5)] ?? '';

  // —— 天气 ——（默认北京，可选位置）
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [weatherErr, setWeatherErr] = useState(false);
  const [city, setCity] = useState<string>(() => localStorage.getItem('overview.city.v1') ?? '北京');

  useEffect(() => {
    let dead = false;
    setWeather(null);
    setWeatherErr(false);
    // 用 Open-Meteo geocoding 查城市坐标
    fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`,
    )
      .then((r) => r.json())
      .then((geo: { results?: { latitude: number; longitude: number; name: string }[] }) => {
        if (dead) return;
        const hit = geo.results?.[0];
        if (!hit) {
          setWeatherErr(true);
          return;
        }
        return fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m&timezone=auto`,
        );
      })
      .then((r) => (r ? r.json() : null))
      .then((data: {
        current?: {
          temperature_2m: number;
          weather_code: number;
          relative_humidity_2m: number;
          wind_speed_10m: number;
        };
      } | null) => {
        if (dead) return;
        if (!data?.current) {
          setWeatherErr(true);
          return;
        }
        setWeather({
          temp: Math.round(data.current.temperature_2m),
          code: data.current.weather_code,
          humidity: data.current.relative_humidity_2m,
          wind: data.current.wind_speed_10m,
          city,
        });
      })
      .catch(() => {
        if (!dead) setWeatherErr(true);
      });
    return () => {
      dead = true;
    };
  }, [city]);

  function handleCitySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = (e.currentTarget.elements.namedItem('city') as HTMLInputElement | null);
    const v = input?.value.trim() ?? '';
    if (v) {
      setCity(v);
      localStorage.setItem('overview.city.v1', v);
    }
  }

  const wd = weather ? WMO[weather.code] ?? { text: '未知', emoji: '🌡️' } : null;

  // —— 实时时间（每秒刷新，让顶部时钟走起来）——
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const weekdayCN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][now.getDay()];

  return (
    <div className="space-y-4 pb-16 md:pb-0">
      {/* 顶部 hero：大日期 + 实时时钟 + 农历/节日 */}
      <section
        className="relative overflow-hidden rounded-2xl p-6 md:p-8 text-white"
        style={{
          background:
            'linear-gradient(135deg, #0d9488 0%, #14b8a6 40%, #5eead4 100%)',
        }}
      >
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full opacity-10 bg-white" />
        <div className="absolute bottom-4 right-12 w-24 h-24 rounded-full opacity-10 bg-white" />
        <div className="relative">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-[44px] md:text-[56px] font-light leading-none tracking-tight tabular-nums">
              {hh}
              <span className="animate-pulse">:</span>
              {mm}
              <span className="text-[28px] md:text-[36px] text-white/60 ml-1 tabular-nums">:{ss}</span>
            </h1>
          </div>
          <div className="mt-3 flex items-baseline gap-2 flex-wrap">
            <span className="text-[22px] md:text-[26px] font-light tracking-wide tabular-nums">
              {todayObj.getMonth() + 1}月{todayObj.getDate()}日
            </span>
            <span className="text-[15px] md:text-[16px] text-white/80">{weekdayCN}</span>
            {/* 农历月与阳历月不同，明确标注避免误读 */}
            {lunarText && (
              <span className="text-[13px] md:text-[14px] text-white/60">
                （{lunarText}）
              </span>
            )}
            {festival && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-[12px] bg-white/25 backdrop-blur">
                🎉 {festival}
              </span>
            )}
          </div>
          <div className="mt-4 text-[14px] md:text-[15px] text-white/90 italic font-light">{quote}</div>
        </div>
      </section>

      {/* 主网格：4 张卡片 2×2 */}
      <div className="grid md:grid-cols-2 gap-3">
        {/* 天气 */}
        <Card title="今日天气" icon="☀️">
          {weather ? (
            <div>
              <div className="flex items-baseline gap-3">
                <span className="text-[44px] leading-none">{wd?.emoji}</span>
                <span className="text-[34px] font-light tabular-nums leading-none">
                  {weather.temp}°
                </span>
                <span className="text-[14px] text-slate-500 dark:text-slate-400">{wd?.text}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[13px] text-slate-600 dark:text-slate-400">
                <div>湿度 <span className="font-medium text-slate-800 dark:text-slate-100 tabular-nums">{weather.humidity}%</span></div>
                <div>风速 <span className="font-medium text-slate-800 dark:text-slate-100 tabular-nums">{weather.wind} km/h</span></div>
              </div>
              <form onSubmit={handleCitySubmit} className="mt-3 flex gap-1.5 text-[12px]">
                <input
                  name="city"
                  defaultValue={weather.city}
                  className="flex-1 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded px-2 py-1"
                  placeholder="城市"
                />
                <button
                  type="submit"
                  className="px-2 py-1 bg-brand-600 text-white rounded hover:bg-brand-700"
                >
                  切换
                </button>
              </form>
            </div>
          ) : weatherErr ? (
            <div className="text-[13px] text-slate-500 dark:text-slate-400">
              <div>⚠️ 天气拉取失败（离线？检查网络）</div>
              <form onSubmit={handleCitySubmit} className="mt-3 flex gap-1.5">
                <input
                  name="city"
                  defaultValue={city}
                  className="flex-1 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded px-2 py-1 text-[12px]"
                  placeholder="城市"
                />
                <button
                  type="submit"
                  className="px-2 py-1 bg-brand-600 text-white rounded hover:bg-brand-700 text-[12px]"
                >
                  重试
                </button>
              </form>
            </div>
          ) : (
            <div className="text-[13px] text-slate-400 dark:text-slate-500">天气加载中…</div>
          )}
        </Card>

        {/* 倒计时（多事件） */}
        <Card title="倒计时" icon="⏳">
          {countdowns.length === 0 ? (
            <div className="text-[12px] text-slate-400 dark:text-slate-500">
              还没有事件，下方添加你的第一个倒计时吧
            </div>
          ) : (
            <ul className="space-y-2">
              {countdowns.map((c) => (
                <CountdownItem
                  key={c.id}
                  item={c}
                  onSave={(label, date) => addOrUpdateCountdown(c.id, label, date)}
                  onDelete={() => deleteCountdown(c.id)}
                />
              ))}
            </ul>
          )}
          <CountdownAddForm onAdd={(label, date) => addOrUpdateCountdown(null, label, date)} />
        </Card>

        {/* 一言 */}
        <Card title="今日一言" icon="💡">
          <p className="text-[18px] md:text-[22px] leading-relaxed font-light text-slate-700 dark:text-slate-200 tracking-wide">
            “{quote}”
          </p>
          <div className="mt-4 text-[12px] text-slate-400 dark:text-slate-500">
            —— 每天一句，按今日日期稳定选取
          </div>
        </Card>

        {/* 快捷笔记 */}
        <Card title="随手记" icon="📝">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="随手写点什么……想做的事、灵感、备忘都可以"
            className="w-full min-h-[120px] bg-transparent border-0 outline-none resize-none text-[14px] leading-relaxed placeholder:text-slate-400 dark:placeholder:text-slate-600"
          />
          <div className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            {note.length} 字 · 自动存浏览器本地
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[16px]">{icon}</span>
        <h2 className="text-[14px] font-medium text-slate-500 dark:text-slate-400 tracking-wider uppercase">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/** 倒计时单项：默认显示剩余天数，点编辑切换到行内表单；保存回写或删除本项 */
function CountdownItem({ item, onSave, onDelete }: {
  item: { id: string; label: string; date: string };
  onSave: (label: string, date: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(item.label);
  const [date, setDate] = useState(item.date);
  const days = daysUntil(item.date);
  if (editing) {
    return (
      <li className="border border-slate-200 dark:border-slate-700 rounded-md p-2 space-y-1.5">
        <input aria-label="事件名" value={label} onChange={(e) => setLabel(e.target.value)} className="w-full text-[13px] border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded px-2 py-1" />
        <input type="date" aria-label="日期" value={date} onChange={(e) => setDate(e.target.value)} className="w-full text-[13px] border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded px-2 py-1" />
        <div className="flex gap-1.5">
          <button type="button" onClick={() => { onSave(label, date); setEditing(false); }} className="px-2 py-1 bg-brand-600 text-white rounded text-[12px]">保存</button>
          <button type="button" onClick={() => setEditing(false)} className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded text-[12px]">取消</button>
        </div>
      </li>
    );
  }
  return (
    <li className="border border-slate-200 dark:border-slate-700 rounded-md p-2 flex items-center justify-between gap-2">
      <div>
        <div className="text-[13px] text-slate-700 dark:text-slate-200">{item.label}</div>
        <div className="mt-0.5 flex items-baseline gap-1.5 text-[12px] text-slate-400 dark:text-slate-500">
          <span className="text-[20px] font-light tabular-nums leading-none text-slate-800 dark:text-slate-100">{Math.abs(days)}</span>
          <span>{days >= 0 ? '天后' : '天前'}</span>
          <span>· {item.date}</span>
        </div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <button type="button" onClick={() => { setLabel(item.label); setDate(item.date); setEditing(true); }} className="px-2 py-1 text-[12px] text-brand-700 hover:underline">编辑</button>
        <button type="button" onClick={onDelete} className="px-2 py-1 text-[12px] text-red-600 hover:underline">删除</button>
      </div>
    </li>
  );
}

/** 倒计时新增表单：行内输入事件名+日期+添加按钮 */
function CountdownAddForm({ onAdd }: { onAdd: (label: string, date: string) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 text-[12px] text-brand-700 hover:underline">+ 添加倒计时事件</button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(label, date);
        setLabel('');
        setDate(new Date().toISOString().slice(0, 10));
        setOpen(false);
      }}
      className="mt-3 border border-dashed border-slate-300 dark:border-slate-700 rounded-md p-2 space-y-1.5"
    >
      <input aria-label="新事件名" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="事件名，比如：答辩" className="w-full text-[13px] border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded px-2 py-1" />
      <input type="date" aria-label="新事件日期" value={date} onChange={(e) => setDate(e.target.value)} className="w-full text-[13px] border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded px-2 py-1" />
      <div className="flex gap-1.5">
        <button type="submit" className="px-2 py-1 bg-brand-600 text-white rounded text-[12px]">添加</button>
        <button type="button" onClick={() => { setOpen(false); setLabel(''); }} className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded text-[12px]">取消</button>
      </div>
    </form>
  );
}
