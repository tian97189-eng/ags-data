with open('src/pages/Cycle/index.tsx','r',encoding='utf-8') as f: t=f.read()
old = """  /** 立即同步落盘：用 ref 读最新状态（不依赖 React 闭包） */
  function persistDraft() {
    if (cycleId == null || indicatorId == null) return;
    const payload = {
      cycleId,
      indicatorId,
      cells: cellsRef.current,
      phases: phasesRef.current,
      blank: blankRef.current,
      dilution: dilutionRef.current,
    };
    if (!isDraftEmpty(payload)) saveAnyDraft(CYCLE_DRAFT_KEY, payload);
  }

  /** 防抖 600ms 存草稿（内容空则跳过） */
  function scheduleDraftSave() {
    if (draftTimer.current != null) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(persistDraft, 600);
  }
  useEffect(() => {
    cellsRef.current = cells;
    phasesRef.current = phases;
    blankRef.current = blank;
    dilutionRef.current = dilution;
    scheduleDraftSave();
  }, [cells, phases, blank, dilution, cycleId, indicatorId]);"""
new = """  /** 立即同步落盘：用 ref 读最新状态（不依赖 React 闭包）。
   * 不使用 setTimeout 防抖——未挂载 timer 会在组件 unmount 后继续跑，
   * 跨 it 写盘污染下一个测试的 localStorage。 */
  function persistDraft() {
    if (cycleId == null || indicatorId == null) return;
    const payload = {
      cycleId,
      indicatorId,
      cells: cellsRef.current,
      phases: phasesRef.current,
      blank: blankRef.current,
      dilution: dilutionRef.current,
    };
    if (!isDraftEmpty(payload)) saveAnyDraft(CYCLE_DRAFT_KEY, payload);
  }
  useEffect(() => {
    cellsRef.current = cells;
    phasesRef.current = phases;
    blankRef.current = blank;
    dilutionRef.current = dilution;
    persistDraft();
  }, [cells, phases, blank, dilution, cycleId, indicatorId]);"""
assert old in t, 'old not found'
t = t.replace(old, new, 1)
old2 = "  const draftTimer = useRef<number | null>(null);\n"
if old2 in t:
    t = t.replace(old2, '', 1)
with open('src/pages/Cycle/index.tsx','w',encoding='utf-8') as f: f.write(t)
print('done')
