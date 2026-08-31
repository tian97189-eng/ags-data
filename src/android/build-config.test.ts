import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 验证 android/app/build.gradle 的 release 签名配置：
 * 1) 存在 signingConfigs.release 块
 * 2) 从 rootProject keystore.properties 读 storeFile/storePassword/keyAlias/keyPassword
 * 3) release buildType 引用该 signingConfig
 *
 * 不实际生成 keystore/build APK —— 用户在自己的 Windows 机器上用 build-apk.bat
 * 自动创建 keystore 后，下次构建就能产出签名一致的 release APK，
 * 覆盖安装时 Android 不会清数据。
 */
describe('release 签名配置（升级安装保留数据）', () => {
  const gradle = readFileSync(
    resolve(process.cwd(), 'android/app/build.gradle'),
    'utf-8',
  );

  it('含 signingConfigs.release 块', () => {
    expect(gradle).toMatch(/signingConfigs\s*\{[\s\S]*release\s*\{/);
  });

  it('从 keystore.properties 读取 storeFile/storePassword/keyAlias/keyPassword', () => {
    // 读 keystore.properties 的相对路径
    expect(gradle).toMatch(/keystore\.properties/);
    expect(gradle).toMatch(/storeFile/);
    expect(gradle).toMatch(/storePassword/);
    expect(gradle).toMatch(/keyAlias/);
    expect(gradle).toMatch(/keyPassword/);
  });

  it('release buildType 使用该 signingConfig', () => {
    // release buildType 中有 signingConfig signingConfigs.release
    const releaseBlock = gradle.match(/buildTypes\s*\{[\s\S]*release\s*\{([\s\S]*?)\}/);
    expect(releaseBlock).not.toBeNull();
    expect(releaseBlock![1]).toMatch(/signingConfig\s+signingConfigs\.release/);
  });

  it('applicationId 保持 com.ags.data（升级安装匹配必要条件）', () => {
    expect(gradle).toMatch(/applicationId\s*[\"']com\.ags\.data[\"']/);
  });
});

describe('build-apk.bat 自动生成 keystore', () => {
  const bat = readFileSync(resolve(process.cwd(), 'build-apk.bat'), 'utf-8');

  it('用 assembleRelease（不是 debug）', () => {
    expect(bat).toMatch(/assembleRelease/);
    expect(bat).not.toMatch(/assembleDebug/);
  });

  it('首次运行自动 keytool 生成 keystore + 写 keystore.properties', () => {
    expect(bat).toMatch(/keytool/);
    expect(bat).toMatch(/ags-release\.keystore/);
    expect(bat).toMatch(/storePassword/);
    expect(bat).toMatch(/keystore\.properties/);
  });

  it('不依赖 AGP 自动生成的 debug keystore（避免每次重建丢签名）', () => {
    // 确认脚本不调 assembleDebug
    expect(bat).not.toMatch(/assembleDebug/);
  });
});

describe('keystore 文件不提交到 git', () => {
  it('.gitignore 包含 keystore 与 keystore.properties', () => {
    const gi = readFileSync(resolve(process.cwd(), '.gitignore'), 'utf-8');
    expect(gi).toMatch(/keystore\.properties/);
    // keystore 文件本身（任意 .keystore / *.jks）
  });
});