// 自签证书工具：为局域网 HTTPS 访问（手机装 PWA 图标）生成证书。
// 纯 Node.js 实现，不依赖 openssl，cmd 双击场景也能用。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 证书默认存放目录：项目根/certs */
export const CERTS_DIR = path.resolve(__dirname, '..', 'certs');

/** 获取本机所有局域网 IPv4（排除回环地址） */
export function getLocalIPs() {
  const ifs = os.networkInterfaces();
  const list = [];
  for (const name of Object.keys(ifs)) {
    for (const ni of ifs[name] ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) list.push(ni.address);
    }
  }
  return list.sort();
}

/**
 * 生成自签证书。
 * 必须带 subjectAltName（含 IP），否则 Chrome 会因证书与地址不匹配而拒绝。
 */
export async function generateCert(ips = [], days = 3650) {
  const altNames = [{ type: 2, value: 'localhost' }];
  for (const ip of ips) altNames.push({ type: 7, ip });

  const attrs = [{ name: 'commonName', value: ips[0] || 'localhost' }];
  return selfsigned.generate(attrs, {
    keySize: 2048,
    days,
    algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames }],
  });
}

/**
 * 确保 certs 目录存在匹配「当前局域网 IP」的证书。
 * IP 变化（换 WiFi / 重启路由器）时自动重新生成，避免手机访问报证书不匹配。
 */
export async function ensureCert(certsDir = CERTS_DIR, days = 3650) {
  const ips = getLocalIPs();
  const keyPath = path.join(certsDir, 'key.pem');
  const certPath = path.join(certsDir, 'cert.pem');
  const metaPath = path.join(certsDir, 'cert-ips.json');

  let meta = null;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    meta = null;
  }

  const missing = !fs.existsSync(keyPath) || !fs.existsSync(certPath);
  const ipChanged = !meta || JSON.stringify(meta.ips) !== JSON.stringify(ips);

  if (missing || ipChanged) {
    const pems = await generateCert(ips, days);
    fs.mkdirSync(certsDir, { recursive: true });
    fs.writeFileSync(keyPath, pems.private, 'utf8');
    fs.writeFileSync(certPath, pems.cert, 'utf8');
    fs.writeFileSync(
      metaPath,
      JSON.stringify({ ips, createdAt: new Date().toISOString() }, null, 2),
      'utf8',
    );
    return { regenerated: true, ips, keyPath, certPath };
  }
  return { regenerated: false, ips, keyPath, certPath };
}

/** 读取已有证书；不存在返回 null（此时应退回 http） */
export function readCert(certsDir = CERTS_DIR) {
  const keyPath = path.join(certsDir, 'key.pem');
  const certPath = path.join(certsDir, 'cert.pem');
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) return null;
  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
    ips: getLocalIPs(),
  };
}

// 直接以 node scripts/cert.mjs 运行时，生成证书并打印结果
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await ensureCert();
  console.log(r.regenerated ? 'cert-generated' : 'cert-existing');
  console.log('IPs: ' + (r.ips.join(', ') || '(none)'));
  console.log('DIR: ' + CERTS_DIR);
}
