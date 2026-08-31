import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { seedIfEmpty } from './db/seed';
import { getSavedEnvId, initSync } from './lib/sync';

seedIfEmpty().then(async () => {
  // 若已配置云环境 ID，自动开启云同步（实时互通）。失败不阻塞使用，可到设置页处理。
  const envId = await getSavedEnvId();
  if (envId) {
    initSync(envId).catch(() => {
      /* 静默：离线或集合权限未配置，用户可在「系统设置 → 云同步」查看原因 */
    });
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
