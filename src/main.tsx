import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { seedIfEmpty } from './db/seed';
import { getSavedEnvId, getSavedAccessKey, getSavedServerURL, initSync } from './lib/sync';

seedIfEmpty().then(async () => {
  // 若已配置云同步，自动开启（实时互通）。失败不阻塞使用，可到设置页查看原因。
  const [appId, appKey, serverURL] = await Promise.all([
    getSavedEnvId(),
    getSavedAccessKey(),
    getSavedServerURL(),
  ]);
  if (appId && appKey) {
    initSync(appId, appKey, serverURL).catch(() => {
      /* 静默：离线或配置不完整，用户可在「系统设置 → 云同步」查看 */
    });
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
