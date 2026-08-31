import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import {
  initSync,
  stopSync,
  syncNow,
  getSavedEnvId,
  saveEnvId,
  getSavedAccessKey,
  saveAccessKey,
  getSavedServerURL,
  saveServerURL,
  syncState,
  onSyncStateChange,
  isSyncing,
  type SyncStatus,
} from '../../lib/sync';
import { formatError } from '../../lib/cloud';
import { useAppStore } from '../../store/useAppStore';

const STATUS_TEXT: Record<SyncStatus, string> = {
  idle: '未启用',
  connecting: '连接中…',
  connected: '已连接（实时同步中）',
  error: '连接失败',
};

export default function CloudSyncSettings() {
  const toast = useAppStore((s) => s.toast);
  const [appId, setAppId] = useState('');
  const [appKey, setAppKey] = useState('');
  const [serverURL, setServerURL] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SyncStatus>(syncState.status);

  const dataCount = useLiveQuery(async () => {
    const [m, r, c] = await Promise.all([
      db.measurements.count(),
      db.reactors.count(),
      db.curves.count(),
    ]);
    return { measurements: m, reactors: r, curves: c };
  }, []);

  useEffect(() => {
    void (async () => {
      setAppId(await getSavedEnvId());
      setAppKey(await getSavedAccessKey());
      setServerURL(await getSavedServerURL());
      setLoaded(true);
    })();
    const off = onSyncStateChange((s) => setStatus(s.status));
    return off;
  }, []);

  async function handleSave() {
    await saveEnvId(appId);
    await saveAccessKey(appKey);
    await saveServerURL(serverURL);
    toast('已保存', 'success');
  }

  async function handleConnect() {
    if (!appId.trim()) {
      toast('请先填写 AppID', 'warning');
      return;
    }
    if (!appKey.trim()) {
      toast('请先填写 AppKey', 'warning');
      return;
    }
    try {
      await saveEnvId(appId);
      await saveAccessKey(appKey);
      await saveServerURL(serverURL);
      await initSync(appId, appKey, serverURL);
      toast('云同步已开启，数据正在互通', 'success');
    } catch (err) {
      toast(`连接失败：${formatError(err)}`, 'error');
    }
  }

  async function handleSyncNow() {
    try {
      await syncNow();
      toast('同步完成', 'success');
    } catch (err) {
      toast(`同步失败：${formatError(err)}`, 'error');
    }
  }

  const connected = status === 'connected';
  const busy = status === 'connecting';

  return (
    <div className="max-w-lg space-y-4">
      <div className="border border-slate-200 rounded-lg p-4">
        <div className="text-sm font-medium mb-1">云同步（实时互通）</div>
        <p className="text-xs text-slate-500 mb-3">
          开启后，手机 App 和电脑上的数据会实时保持一致——任何一端保存，另一端自动更新。
          数据存放在 LeanCloud 免费空间（1GB 存储 + 每天 3 万次请求，实验数据量完全够用）。
        </p>

        <div className="flex items-center gap-2 mb-2">
          <label className="text-xs text-slate-600 w-20 shrink-0" htmlFor="lc-app-id">
            AppID
          </label>
          <input
            id="lc-app-id"
            type="text"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="控制台「设置 → 应用凭证」复制"
            disabled={connected}
            className="flex-1 px-3 py-1.5 text-xs rounded-md border border-slate-300 focus:outline-none focus:border-teal-500 disabled:bg-slate-100 font-mono"
          />
        </div>

        <div className="flex items-center gap-2 mb-2">
          <label className="text-xs text-slate-600 w-20 shrink-0" htmlFor="lc-app-key">
            AppKey
          </label>
          <input
            id="lc-app-key"
            type="text"
            value={appKey}
            onChange={(e) => setAppKey(e.target.value)}
            placeholder="与 AppID 同一页，Master Key 不要用"
            disabled={connected}
            className="flex-1 px-3 py-1.5 text-xs rounded-md border border-slate-300 focus:outline-none focus:border-teal-500 disabled:bg-slate-100 font-mono"
          />
        </div>

        <div className="flex items-center gap-2 mb-3">
          <label className="text-xs text-slate-600 w-20 shrink-0" htmlFor="lc-server-url">
            服务器
          </label>
          <input
            id="lc-server-url"
            type="text"
            value={serverURL}
            onChange={(e) => setServerURL(e.target.value)}
            placeholder="https://xxx.lc-cn-n1-shared.com（控制台同一页）"
            disabled={connected}
            className="flex-1 px-3 py-1.5 text-xs rounded-md border border-slate-300 focus:outline-none focus:border-teal-500 disabled:bg-slate-100 font-mono"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={connected}
            className="px-3 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:border-teal-400 disabled:opacity-40"
          >
            保存
          </button>
        </div>

        <div className="text-xs text-slate-500 mb-3">
          状态：<span className={connected ? 'text-teal-600 font-medium' : status === 'error' ? 'text-red-600' : 'text-slate-700'}>{STATUS_TEXT[status]}</span>
          {connected && syncState.lastSyncAt != null && (
            <span className="text-slate-400">
              {' '}· 最近同步 {new Date(syncState.lastSyncAt).toLocaleTimeString()}
            </span>
          )}
          {status === 'error' && syncState.lastError && (
            <div className="text-red-500 mt-1 break-words">{syncState.lastError}</div>
          )}
          {connected && syncState.pendingOps > 0 && (
            <div className="text-amber-600 mt-1">有 {syncState.pendingOps} 条待补传的记录（离线时修改的），正在自动补传…</div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {!connected ? (
            <button
              type="button"
              onClick={handleConnect}
              disabled={busy}
              className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {busy ? '连接中…' : '启用云同步'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSyncNow}
                className="px-3 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:border-teal-400"
              >
                立即同步
              </button>
              <button
                type="button"
                onClick={() => {
                  stopSync();
                  toast('云同步已停用', 'success');
                }}
                className="px-3 py-1.5 text-xs rounded-md border border-red-200 text-red-600 hover:border-red-400"
              >
                停用云同步
              </button>
            </>
          )}
        </div>
      </div>

      <div className="border border-slate-200 rounded-lg p-4">
        <div className="text-sm font-medium mb-1">怎么开通（5 分钟）</div>
        <ol className="text-xs text-slate-500 space-y-1.5 list-decimal pl-4">
          <li>浏览器打开 <span className="font-mono text-teal-700">leancloud.cn</span>，注册账号（手机号或邮箱）</li>
          <li>登录后点「<span className="font-medium text-slate-700">创建应用</span>」→ 名字随意（如 AGS 数据）→ 选国内节点（华北/华东/华南离你近的）→ 创建</li>
          <li>进入应用 → 左侧「<span className="font-medium text-slate-700">设置 → 应用凭证</span>」→ 复制 <span className="font-mono">AppID</span>、<span className="font-mono">AppKey</span>、<span className="font-mono">服务器地址</span>（形如 <span className="font-mono">https://xxx.lc-cn-n1-shared.com</span>）</li>
          <li>把三个值填到本页 → 点「启用云同步」</li>
          <li>若连接时报「游客未开通」：到 LeanCloud 控制台「设置 → 安全设置」→ 打开「<span className="font-medium text-slate-700">允许游客/匿名用户登录</span>」（默认是开的，一般不用动）</li>
          <li>若控制台开启「安全域名」限制：把软件的访问地址（如 <span className="font-mono">http://localhost:4174</span>）加进「设置 → 安全设置 → Web 安全域名」</li>
        </ol>
        <p className="text-xs text-amber-600 mt-2">
          首次连接会把电脑上的全部数据上传到云端，之后手机、电脑就互通了。填错三个值任何一项都会连接失败，检查后重试即可。
        </p>
      </div>

      {loaded && (
        <div className="text-xs text-slate-400">
          本地现有：{dataCount?.measurements ?? 0} 条测量 · {dataCount?.reactors ?? 0} 个反应器 · {dataCount?.curves ?? 0} 条标曲
          {isSyncing() ? '（连接中，会自动上传）' : ''}
        </div>
      )}
    </div>
  );
}
