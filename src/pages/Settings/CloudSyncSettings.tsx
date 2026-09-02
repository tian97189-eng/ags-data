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
  const [envId, setEnvId] = useState('');
  const [accessKey, setAccessKey] = useState('');
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
      setEnvId(await getSavedEnvId());
      setAccessKey(await getSavedAccessKey());
      setLoaded(true);
    })();
    const off = onSyncStateChange((s) => setStatus(s.status));
    return off;
  }, []);

  async function handleSave() {
    await saveEnvId(envId);
    await saveAccessKey(accessKey);
    toast('已保存', 'success');
  }

  async function handleConnect() {
    if (!envId.trim()) {
      toast('请先填写环境 ID', 'warning');
      return;
    }
    if (!accessKey.trim()) {
      toast('请先填写 API 密钥', 'warning');
      return;
    }
    try {
      await saveEnvId(envId);
      await saveAccessKey(accessKey);
      await initSync(envId, accessKey);
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
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
        <div className="text-base font-medium mb-1">云同步（实时互通）</div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          开启后，手机 App 和电脑上的数据会实时保持一致——任何一端保存，另一端自动更新。
          数据存放在腾讯云免费空间（每月 3000 资源点，实验数据量完全够用）。
        </p>

        <div className="flex items-center gap-2 mb-2">
          <label className="text-xs text-slate-600 dark:text-slate-400 w-20 shrink-0" htmlFor="cloud-env-id">
            环境 ID
          </label>
          <input
            id="cloud-env-id"
            type="text"
            value={envId}
            onChange={(e) => setEnvId(e.target.value)}
            placeholder="ags-xxxxxxxx 格式"
            disabled={connected}
            className="flex-1 px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 focus:outline-none focus:border-teal-500 disabled:bg-slate-100 dark:bg-slate-800"
          />
        </div>

        <div className="flex items-center gap-2 mb-3">
          <label className="text-xs text-slate-600 dark:text-slate-400 w-20 shrink-0" htmlFor="cloud-access-key">
            API 密钥
          </label>
          <input
            id="cloud-access-key"
            type="text"
            value={accessKey}
            onChange={(e) => setAccessKey(e.target.value)}
            placeholder="在控制台「Web API Key」页复制（以 pk- 开头）"
            disabled={connected}
            className="flex-1 px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 focus:outline-none focus:border-teal-500 disabled:bg-slate-100 dark:bg-slate-800 font-mono"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={connected}
            className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-teal-400 disabled:opacity-40"
          >
            保存
          </button>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          状态：<span className={connected ? 'text-teal-600 font-medium' : status === 'error' ? 'text-red-600' : 'text-slate-700 dark:text-slate-300'}>{STATUS_TEXT[status]}</span>
          {connected && syncState.lastSyncAt != null && (
            <span className="text-slate-400 dark:text-slate-500">
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
                className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-teal-400"
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

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-card p-4">
        <div className="text-base font-medium mb-1">怎么开通（5 分钟）</div>
        <ol className="text-xs text-slate-500 dark:text-slate-400 space-y-1.5 list-decimal pl-4">
          <li>电脑浏览器打开 <span className="font-mono text-teal-700">cloud.tencent.com</span>，用微信/QQ 登录</li>
          <li>搜索进入「<span className="font-medium text-slate-700 dark:text-slate-300">云开发 CloudBase</span>」→ 创建环境（免费体验版，地域选离你近的）</li>
          <li>环境创建完后，到「<span className="font-medium text-slate-700 dark:text-slate-300">用户管理 → 登录方式</span>」页，把「<span className="font-medium text-slate-700 dark:text-slate-300">匿名登录</span>」打开（<span className="text-red-500">这步不打开就连不上</span>）</li>
          <li>到「<span className="font-medium text-slate-700 dark:text-slate-300">环境 → API Key（Web 安全域名 / API Key）</span>」页，复制 Web 密钥（以 <span className="font-mono">pk-</span> 开头）</li>
          <li>环境 ID（<span className="font-mono">ags-...</span> 格式）和 API 密钥填到本页 → 点「启用云同步」</li>
          <li>首次成功后会同步数据库结构；到控制台「数据库」页，<span className="font-medium text-slate-700 dark:text-slate-300">把每个集合权限改为「所有用户可读写」</span>，再点一次「立即同步」</li>
        </ol>
        <p className="text-xs text-amber-600 mt-2">
          90% 的连接失败是因为第 3 步「匿名登录」没打开，或者第 6 步「集合权限」没改。
        </p>
      </div>

      {loaded && (
        <div className="text-xs text-slate-400 dark:text-slate-500">
          本地现有：{dataCount?.measurements ?? 0} 条测量 · {dataCount?.reactors ?? 0} 个反应器 · {dataCount?.curves ?? 0} 条标曲
          {isSyncing() ? '（连接中，会自动上传）' : ''}
        </div>
      )}
    </div>
  );
}