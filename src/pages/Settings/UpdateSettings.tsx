import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { getAppVersion, checkUpdate, type UpdateInfo } from '../../lib/updater';
import { useAppStore } from '../../store/useAppStore';

export default function UpdateSettings() {
  const toast = useAppStore((s) => s.toast);
  const [url, setUrl] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ found: boolean; info?: UpdateInfo; error?: string } | null>(null);

  const savedUrl = useLiveQuery(async () => {
    const s = await db.settings.get('updateUrl');
    return (s?.value as string) ?? '';
  }, []);

  useEffect(() => {
    if (savedUrl != null) setUrl(savedUrl);
  }, [savedUrl]);

  async function handleSave() {
    await db.settings.put({ key: 'updateUrl', value: url.trim() });
    toast('更新检查地址已保存', 'success');
  }

  async function handleCheck() {
    if (!url.trim()) {
      toast('请先填写更新检查地址', 'warning');
      return;
    }
    setChecking(true);
    setResult(null);
    try {
      const info = await checkUpdate(url.trim());
      setResult({ found: !!info, info: info ?? undefined });
    } catch (err) {
      setResult({ found: false, error: (err as Error).message });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="border border-slate-200 rounded-lg p-4">
        <div className="text-sm font-medium mb-1">软件更新</div>
        <div className="text-xs text-slate-500 mb-3">
          当前版本：<span className="font-mono text-teal-700">v{getAppVersion()}</span>
          <span className="ml-2 text-slate-400">电脑端改完功能重新构建后刷新即新版；手机 App 需要在这里检查并下载新版安装包。</span>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <label className="text-xs text-slate-600 w-20 shrink-0" htmlFor="update-url">
            检查地址
          </label>
          <input
            id="update-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/version.json（留空 = 不检查）"
            className="flex-1 px-3 py-1.5 text-xs rounded-md border border-slate-300 focus:outline-none focus:border-teal-500"
          />
          <button
            type="button"
            onClick={handleSave}
            className="px-3 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:border-teal-400"
          >
            保存
          </button>
        </div>

        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={handleCheck}
            disabled={checking || !url.trim()}
            className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {checking ? '检查中…' : '检查更新'}
          </button>
        </div>

        {result && (
          <div className="mt-3 text-xs">
            {result.error ? (
              <div className="text-red-600">{result.error}</div>
            ) : result.found && result.info ? (
              <div className="border border-teal-200 bg-teal-50 rounded-md p-3">
                <div className="font-medium text-teal-800">
                  发现新版本 v{result.info.version}
                  {result.info.publishedAt ? `（${result.info.publishedAt} 发布）` : ''}
                </div>
                {result.info.notes && <div className="text-teal-700 mt-1 whitespace-pre-line">{result.info.notes}</div>}
                {result.info.apkUrl ? (
                  <a
                    href={result.info.apkUrl}
                    download
                    className="inline-block mt-2 px-3 py-1.5 rounded-md bg-teal-600 text-white hover:bg-teal-700"
                  >
                    下载新版安装包
                  </a>
                ) : (
                  <div className="text-slate-500 mt-1">（version.json 未提供下载地址，请联系开发者获取新版安装包）</div>
                )}
              </div>
            ) : (
              <div className="text-slate-600">已是最新版本（v{getAppVersion()}）</div>
            )}
          </div>
        )}
      </div>

      <div className="border border-slate-200 rounded-lg p-4">
        <div className="text-sm font-medium mb-1">发布新版本怎么做</div>
        <ol className="text-xs text-slate-500 space-y-1.5 list-decimal pl-4">
          <li>修改代码后，把 <span className="font-mono">package.json</span> 里的版本号往上加（如 1.0.0 → 1.1.0）</li>
          <li>双击 <span className="font-mono">build-apk.bat</span> 重新打包出新的 APK</li>
          <li>把新 APK 传到任意文件托管（腾讯云存储 / GitHub Releases / 网盘直链均可），拿到下载链接</li>
          <li>把 version.json 更新成新版本号和下载链接，放到一个稳定网址（如你云环境的静态托管）</li>
          <li>手机 App 打开时（或点「检查更新」）就会提示下载新版</li>
        </ol>
      </div>

      {/* 关于本软件（仅显示在软件更新 tab 下方） */}
      <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
        <div className="text-sm font-medium mb-2">关于本软件</div>
        <dl className="text-xs text-slate-600 space-y-1">
          <div className="flex"><dt className="w-20 shrink-0 text-slate-500">版本</dt><dd><span className="font-mono text-teal-700">v{getAppVersion()}</span></dd></div>
          <div className="flex"><dt className="w-20 shrink-0 text-slate-500">用途</dt><dd>好氧颗粒污泥（AGS）实验室数据记录与分析</dd></div>
          <div className="flex"><dt className="w-20 shrink-0 text-slate-500">作者</dt><dd>人无再少年</dd></div>
          <div className="flex"><dt className="w-20 shrink-0 text-slate-500">联系</dt><dd>QQ：<a className="text-teal-700 hover:underline font-mono" href="tencent://message/?uin=2448820735" rel="noopener">2448820735</a>（点击发起临时会话）</dd></div>
        </dl>
        <p className="text-[11px] text-slate-400 mt-3">本工具所有数据均存储在本地浏览器/手机端，不上传到任何云服务（除非你主动配置云同步）。</p>
      </div>
    </div>
  );
}
