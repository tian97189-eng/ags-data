import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { seedIfEmpty } from './db/seed';
import { getSavedEnvId, getSavedAccessKey, initSync } from './lib/sync';

seedIfEmpty().then(async () => {
  // 若已配置云环境，自动开启云同步（实时互通）。失败不阻塞使用，可到设置页查看原因。
  const [envId, accessKey] = await Promise.all([getSavedEnvId(), getSavedAccessKey()]);
  if (envId && accessKey) {
    initSync(envId, accessKey).catch(() => {
      /* 静默：离线或登录方式未启用/集合权限未配置 */
    });
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
