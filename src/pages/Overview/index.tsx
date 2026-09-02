import { useEffect, useState, useMemo, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';

/**
 * 今日概览（非实验数据）：日期 · 天气 · 一言 · 倒计时 · 快捷笔记。
 * 数据存 localStorage，天气从 Open-Meteo 公开 API 拉（无需 key）。
 */

const NOTES_KEY = 'overview.notes.v1';
const COUNTDOWN_KEY = 'overview.countdown.v1';
/** 用户手动设置的城市（localStorage），空 = 未设置（不要默认写死北京） */
const CITY_KEY = 'overview.city.v1';

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

/** HH:MM（天气"更新于"时间戳用） */
function fmtHm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

  // —— 天气 ——（默认不设城市：可📍自动定位，或手动输入城市名；数据每 30 分钟自动刷新）
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [weatherErr, setWeatherErr] = useState(false);
  const [city, setCity] = useState<string>(() => localStorage.getItem(CITY_KEY) ?? '');
  // 自动定位坐标（优先于手动城市）；geoLabel 是反查出的省市区名（可延迟补上，不影响请求）
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [geoLabel, setGeoLabel] = useState('');
  const [locating, setLocating] = useState(false);
  const [locateMsg, setLocateMsg] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // 当前生效的查询方式（供 30 分钟定时器复用），null = 未设置城市也不定位
  const lastReq = useRef<{ kind: 'geo'; lat: number; lon: number } | { kind: 'city'; city: string } | null>(null);
  const reqSeq = useRef(0);

  async function loadWeather(
    desc: { kind: 'geo'; lat: number; lon: number } | { kind: 'city'; city: string },
  ): Promise<void> {
    const seq = ++reqSeq.current;
    setWeather(null);
    setWeatherErr(false);
    try {
      let lat: number, lon: number, label: string;
      if (desc.kind === 'geo') {
        lat = desc.lat;
        lon = desc.lon;
        label = geoLabel || '当前位置';
      } else {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(desc.city)}&count=1&language=zh`,
        );
        const geoJson = (await geoRes.json()) as { results?: { latitude: number; longitude: number }[] };
        const hit = geoJson.results?.[0];
        if (!hit) {
          if (seq === reqSeq.current) {
            setWeatherErr(true);
            setLocateMsg(`没找到「${desc.city}」，试试带市的写法（如：长沙）`);
          }
          return;
        }
        lat = hit.latitude;
        lon = hit.longitude;
        label = desc.city;
      }
      const wRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m&timezone=auto`,
      );
      const wJson = (await wRes.json()) as {
        current?: { temperature_2m: number; weather_code: number; relative_humidity_2m: number; wind_speed_10m: number };
      };
      if (!wJson?.current || seq !== reqSeq.current) return;
      setWeather({
        temp: Math.round(wJson.current.temperature_2m),
        code: wJson.current.weather_code,
        humidity: wJson.current.relative_humidity_2m,
        wind: wJson.current.wind_speed_10m,
        city: label,
      });
      setUpdatedAt(new Date());
      setLocateMsg('');
    } catch {
      if (seq === reqSeq.current) setWeatherErr(true);
    }
  }

  // 城市或定位变化 → 首次/切换时拉取
  useEffect(() => {
    if (geoCoords) {
      lastReq.current = { kind: 'geo', lat: geoCoords.lat, lon: geoCoords.lon };
      void loadWeather(lastReq.current);
    } else if (city) {
      lastReq.current = { kind: 'city', city };
      void loadWeather(lastReq.current);
    } else {
      lastReq.current = null;
      reqSeq.current += 1; // 让在途请求作废
      setWeather(null);
      setWeatherErr(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, geoCoords]);

  // 数据会过期 → 每 30 分钟自动刷新一次
  useEffect(() => {
    if (!lastReq.current) return;
    const t = setInterval(() => {
      const cur = lastReq.current;
      if (cur) void loadWeather(cur);
    }, 30 * 60 * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, geoCoords]);

  // 反查城市名晚到 → 补进已显示的城市（不重新发天气请求）
  useEffect(() => {
    if (geoCoords && geoLabel) {
      setWeather((w) => (w ? { ...w, city: geoLabel } : w));
    }
  }, [geoLabel, geoCoords]);

  function handleCitySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = (e.currentTarget.elements.namedItem('city') as HTMLInputElement | null);
    const v = input?.value.trim() ?? '';
    if (!v) return;
    setGeoCoords(null); // 手动输入城市优先于定位
    setGeoLabel('');
    setCity(v);
    localStorage.setItem(CITY_KEY, v);
    setLocateMsg('');
  }

  /** 一键定位：浏览器/手机定位拿到坐标 → 直接按坐标查天气（不经城市名） */
  function handleLocate() {
    setLocateMsg('');
    if (!('geolocation' in navigator)) {
      setLocateMsg('此设备不支持定位，请在上方输入城市名查询');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setGeoCoords({ lat: latitude, lon: longitude });
        // 反查城市名用于显示（最多等 4s，失败/离线则显示"当前位置"，不阻塞天气）
        (async () => {
          try {
            const ctrl = new AbortController();
            const tm = setTimeout(() => ctrl.abort(), 4000);
            const res = await fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=zh`,
              { signal: ctrl.signal },
            );
            clearTimeout(tm);
            const j = (await res.json()) as { principalSubdivision?: string; city?: string; locality?: string };
            const parts = [j.principalSubdivision, j.city || j.locality].filter(Boolean);
            setGeoLabel(parts.join(' · ') || '当前位置');
          } catch {
            setGeoLabel('当前位置');
          }
        })();
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocateMsg('定位失败（未授权位置权限？），请在上方输入城市名查询');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
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
          {locating ? (
            <div className="text-[13px] text-slate-400 dark:text-slate-500">正在定位…</div>
          ) : weather ? (
            <div>
              <div className="flex items-baseline gap-3">
                <span className="text-[44px] leading-none">{wd?.emoji}</span>
                <span className="text-[34px] font-light tabular-nums leading-none">
                  {weather.temp}°
                </span>
                <span className="text-[14px] text-slate-500 dark:text-slate-400">{wd?.text}</span>
              </div>
              <div className="mt-1 text-[12px] text-slate-400 dark:text-slate-500">
                {weather.city}
                {updatedAt && ` · 更新于 ${fmtHm(updatedAt)}`}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[13px] text-slate-600 dark:text-slate-400">
                <div>湿度 <span className="font-medium text-slate-800 dark:text-slate-100 tabular-nums">{weather.humidity}%</span></div>
                <div>风速 <span className="font-medium text-slate-800 dark:text-slate-100 tabular-nums">{weather.wind} km/h</span></div>
              </div>
            </div>
          ) : weatherErr ? (
            <div className="text-[13px] text-slate-500 dark:text-slate-400">
              <div>⚠️ 天气拉取失败（离线？检查网络后点下方重试）</div>
            </div>
          ) : (
            <div className="text-[13px] text-slate-500 dark:text-slate-400">
              {geoCoords
                ? '已定位，天气加载中…'
                : '未设置城市：点「自动定位」用当前位置，或输入城市名查询（如：长沙）'}
            </div>
          )}
          <form onSubmit={handleCitySubmit} className="mt-3 flex gap-1.5 text-[12px]">
            <input
              name="city"
              className="flex-1 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded px-2 py-1"
              placeholder={city || '城市名（如：长沙）'}
            />
            <button
              type="submit"
              className="px-2 py-1 bg-brand-600 text-white rounded hover:bg-brand-700 shrink-0"
            >
              查询
            </button>
            <button
              type="button"
              onClick={handleLocate}
              disabled={locating}
              className="px-2 py-1 border border-brand-400 text-brand-700 dark:text-brand-300 rounded hover:bg-brand-50 dark:hover:bg-slate-700 shrink-0 disabled:opacity-50"
            >
              {locating ? '定位中…' : '📍 自动定位'}
            </button>
          </form>
          {locateMsg && (
            <div className="mt-1.5 text-[12px] text-amber-600 dark:text-amber-400">{locateMsg}</div>
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
