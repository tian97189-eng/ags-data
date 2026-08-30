import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';
import { getLocalIPs, generateCert, ensureCert, readCert } from '../../scripts/cert.mjs';

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ags-cert-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      // 忽略清理失败
    }
  }
});

describe('cert 证书工具', () => {
  it('getLocalIPs 返回局域网 IPv4 数组', () => {
    const ips = getLocalIPs();
    expect(Array.isArray(ips)).toBe(true);
  });

  it('generateCert 生成含 SAN 的有效证书（localhost + IP）', async () => {
    const pems = await generateCert(['192.168.1.5']);
    expect(pems.cert).toContain('BEGIN CERTIFICATE');
    expect(pems.private).toContain('PRIVATE KEY');
    const x = new X509Certificate(pems.cert);
    expect(x.subjectAltName).toContain('DNS:localhost');
    expect(x.subjectAltName).toContain('IP Address:192.168.1.5');
  });

  it('ensureCert 首次生成、再次调用幂等不重复生成', async () => {
    const dir = tmpDir();
    const r1 = await ensureCert(dir);
    expect(r1.regenerated).toBe(true);
    expect(fs.existsSync(path.join(dir, 'key.pem'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'cert.pem'))).toBe(true);

    const r2 = await ensureCert(dir);
    expect(r2.regenerated).toBe(false);
  });

  it('局域网 IP 变化时自动重新生成证书', async () => {
    const dir = tmpDir();
    await ensureCert(dir);
    // 模拟换网络导致 IP 变化
    fs.writeFileSync(
      path.join(dir, 'cert-ips.json'),
      JSON.stringify({ ips: ['10.0.0.99'] }),
    );
    const r = await ensureCert(dir);
    expect(r.regenerated).toBe(true);
  });

  it('readCert 无证书返回 null，有证书返回 key/cert', async () => {
    const dir = tmpDir();
    expect(readCert(dir)).toBeNull();

    await ensureCert(dir);
    const c = readCert(dir);
    expect(c).not.toBeNull();
    expect(c!.key.length).toBeGreaterThan(100);
    expect(c!.cert.toString()).toContain('BEGIN CERTIFICATE');
  });
});
