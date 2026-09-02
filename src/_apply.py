with open('src/pages/Overview/index.tsx','r',encoding='utf-8') as f: t=f.read()
old_state = """  const [countdown, setCountdown] = useState<{ label: string; date: string } | null>(() => {
    const raw = localStorage.getItem(COUNTDOWN_KEY);
    if (!raw) return null;
    try {
      const v = JSON.parse(raw);
      return v && typeof v.label === 'string' && typeof v.date === 'string' ? v : null;
    } catch {
      return null;
    }
  });
  const [editingCd, setEditingCd] = useState(false);
  const [cdLabel, setCdLabel] = useState(countdown?.label ?? '');
  const [cdDate, setCdDate] = useState(countdown?.date ?? todayStr);

  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(NOTES_KEY, note), 300);
    return () => clearTimeout(t);
  }, [note]);

  function saveCountdown() {
    const next = cdLabel.trim() && cdDate ? { label: cdLabel.trim(), date: cdDate } : null;
    setCountdown(next);
    if (next) localStorage.setItem(COUNTDOWN_KEY, JSON.stringify(next));
    else localStorage.removeItem(COUNTDOWN_KEY);
    setEditingCd(false);
  }
  function clearCountdown() {
    setCountdown(null);
    localStorage.removeItem(COUNTDOWN_KEY);
    setEditingCd(false);
  }"""
new_state = """  interface CdItem { id: string; label: string; date: string }
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
  }"""
assert old_state in t
t = t.replace(old_state, new_state, 1)

old_ui_start = "        {/* 倒计时 */}"
old_ui_end = "      </Card>\n\n        {/* 一言 */}"
start_idx = t.find(old_ui_start)
end_idx = t.find(old_ui_end, start_idx) + len("      </Card>")
old_ui = t[start_idx:end_idx]
new_ui = """        {/* 倒计时（多事件） */}
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
        </Card>"""
t = t.replace(old_ui, new_ui, 1)
t = t.replace("  const cdDays = countdown ? daysUntil(countdown.date) : null;\n", "")
t = t.replace("import { useState } from 'react';", "import { useEffect, useState } from 'react';", 1)

components = '''function CountdownItem({ item, onSave, onDelete }: {
  item: { id: string; label: string; date: string };
  onSave: (label: string, date: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(item.label);
  const [date, setDate] = useState(item.date);
  const days = daysUntil(item.date);
  if (editing) {
    return <li className="border border-slate-200 dark:border-slate-700 rounded-md p-2 space-y-1.5"><input aria-label="事件名" value={label} onChange={(e) => setLabel(e.target.value)} className="w-full text-[13px] border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded px-2 py-1" /><input type="date" aria-label="日期" value={date} onChange={(e) => setDate(e.target.value)} className="w-full text-[13px] border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded px-2 py-1" /><div className="flex gap-1.5"><button type="button" onClick={() => { onSave(label, date); setEditing(false); }} className="px-2 py-1 bg-brand-600 text-white rounded text-[12px]">保存</button><button type="button" onClick={() => setEditing(false)} className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded text-[12px]">取消</button></div></li>;
  }
  return <li className="border border-slate-200 dark:border-slate-700 rounded-md p-2 flex items-center justify-between gap-2"><div><div className="text-[13px] text-slate-700 dark:text-slate-200">{item.label}</div><div className="mt-0.5 flex items-baseline gap-1.5 text-[12px] text-slate-400 dark:text-slate-500"><span className="text-[20px] font-light tabular-nums leading-none text-slate-800 dark:text-slate-100">{Math.abs(days)}</span><span>{days >= 0 ? '天后' : '天前'}</span><span>· {item.date}</span></div></div><div className="flex gap-1.5 shrink-0"><button type="button" onClick={() => { setLabel(item.label); setDate(item.date); setEditing(true); }} className="px-2 py-1 text-[12px] text-brand-700 hover:underline">编辑</button><button type="button" onClick={onDelete} className="px-2 py-1 text-[12px] text-red-600 hover:underline">删除</button></div></li>;
}

function CountdownAddForm({ onAdd }: { onAdd: (label: string, date: string) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="mt-3 text-[12px] text-brand-700 hover:underline">+ 添加倒计时事件</button>;
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); onAdd(label, date); setLabel(''); setDate(new Date().toISOString().slice(0, 10)); setOpen(false); }} className="mt-3 border border-dashed border-slate-300 dark:border-slate-700 rounded-md p-2 space-y-1.5">
      <input aria-label="新事件名" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="事件名，比如：答辩" className="w-full text-[13px] border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded px-2 py-1" />
      <input type="date" aria-label="新事件日期" value={date} onChange={(e) => setDate(e.target.value)} className="w-full text-[13px] border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded px-2 py-1" />
      <div className="flex gap-1.5">
        <button type="submit" className="px-2 py-1 bg-brand-600 text-white rounded text-[12px]">添加</button>
        <button type="button" onClick={() => { setOpen(false); setLabel(''); }} className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded text-[12px]">取消</button>
      </div>
    </form>
  );
}

'''
marker = 'export default function OverviewPage() {'
assert marker in t and t.count(marker) == 1
t = t.replace(marker, components + marker, 1)
with open('src/pages/Overview/index.tsx','w',encoding='utf-8') as f: f.write(t)
print('CountdownItem:', t.count('function CountdownItem'), 'CountdownAddForm:', t.count('function CountdownAddForm'))
