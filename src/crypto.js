'use strict';
// 数据加密: AES-256-GCM + AAD 绑定(字段:行ID, 防密文跨行/跨字段置换)。
// 主密钥只有三种方式:
//   1) Docker Secrets(生产): /run/secrets/vrcnotifier_master_key;
//      容器内首次启动无密钥 → 自动生成并存到 Docker secrets 目录(./secrets/master_key,
//      经 ./secrets:/secrets 挂载落宿主机; 未挂载时兜底存数据卷), 下次启动自动复用
//   2) 环境变量 MASTER_KEY —— 手动启动(本地开发), 提供时跳过自动生成
//   3) 研发模式不加密 —— 手动 --no-encrypt 强制; 非容器环境(Windows 测试/本地)无密钥时自动降级不加密启动
// 密钥不符/密文损坏 → 由启动流程静默清库重启(见 index.js)。
// 密文格式: v1:<base64(iv|tag|cipher)>; 无前缀的旧值按明文直通(尚未上线, 无需迁移)。

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PREFIX = 'v1:';

/** 解码主密钥: 64 位 hex 或 32 字节 base64, 其它格式报错 */
function decodeKey(text) {
  const s = String(text || '').trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, 'hex');
  try {
    const b = Buffer.from(s, 'base64');
    if (b.length === 32) return b;
  } catch (e) { /* 继续抛错 */ }
  throw new Error('主密钥格式无效: 需要 64 位 hex 或 32 字节 base64');
}

/** 读取 Docker Secret(生产第一优先级密钥来源) */
function loadMasterKeyFromSecret(file = '/run/secrets/vrcnotifier_master_key') {
  const fs = require('node:fs');
  return decodeKey(fs.readFileSync(file, 'utf8'));
}

/** 读取已保存的密钥文件(首次启动自动生成后落盘的), 不可用 → null */
function readSavedKey(file) {
  try {
    const s = String(fs.readFileSync(file, 'utf8')).trim();
    if (!s) return null;
    return decodeKey(s);
  } catch (e) {
    return null;
  }
}

function dirWritable(dir) {
  try {
    if (!fs.statSync(dir).isDirectory()) return false;
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch (e) {
    return false;
  }
}

function saveKey(file, hexKey) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, 'w', 0o600);
  fs.writeSync(fd, hexKey + '\n');
  fs.closeSync(fd);
}

/**
 * 主密钥三种方式(按优先级):
 *   1) Docker Secret(生产) 2) 环境变量 MASTER_KEY(手动启动)
 *   3) 研发模式不加密(手动 --no-encrypt; 非容器无密钥时自动降级)
 * 容器内首次启动且以上均无 → 自动生成密钥并保存(docker secrets 目录优先, 数据卷兜底), 下次启动自动复用;
 * 非容器环境(Windows 测试/本地)从不自动生成, 无密钥即不加密启动。
 * 返回 { key, mode, savedTo? }(mode: docker-secret | env | saved | generated | none | missing)。
 */
function resolveMasterKey({
  secretFile = '/run/secrets/vrcnotifier_master_key',
  envKey = null,
  devNoEncrypt = false,
  inDocker = false,
  secretsDir = null, // Docker secrets 目录(生产: ./secrets 挂载)
  keyFile = null     // 数据卷兜底位置(dbPath 目录内)
} = {}) {
  if (devNoEncrypt) return { key: null, mode: 'none' };
  try {
    return { key: loadMasterKeyFromSecret(secretFile), mode: 'docker-secret' };
  } catch (e) { /* 无 Secret: 尝试环境变量 */ }
  if (envKey) {
    return { key: decodeKey(envKey), mode: 'env' };
  }
  // 之前首次启动自动生成过的密钥: 复用
  for (const f of [secretsDir && path.join(secretsDir, 'master_key'), keyFile].filter(Boolean)) {
    const saved = readSavedKey(f);
    if (saved) return { key: saved, mode: 'saved', savedTo: f };
  }
  // 容器内首次启动: 自动生成并保存(env/研发模式已提前返回, 不会走到这里)
  if (inDocker) {
    const hex = crypto.randomBytes(32).toString('hex');
    const target = (secretsDir && dirWritable(secretsDir)) ? path.join(secretsDir, 'master_key') : keyFile;
    if (target) {
      try {
        saveKey(target, hex);
        return { key: Buffer.from(hex, 'hex'), mode: 'generated', savedTo: target };
      } catch (e) { /* 无可写位置: 降级不加密 */ }
    }
  }
  // 非容器(Windows 测试/本地)或无可写位置: 不加密启动
  return { key: null, mode: 'missing' };
}

function createCrypto({ masterKey }) {
  const key = Buffer.isBuffer(masterKey) ? masterKey : decodeKey(masterKey);
  if (key.length !== 32) throw new Error('主密钥必须是 32 字节(64 位 hex)');

  function encrypt(plain, aad) {
    if (plain === null || plain === undefined) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(String(aad || ''), 'utf8'));
    const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
  }

  function decrypt(blob, aad) {
    if (blob === null || blob === undefined) return null;
    const s = String(blob);
    if (!s.startsWith(PREFIX)) return s; // 旧明文直通
    try {
      const buf = Buffer.from(s.slice(PREFIX.length), 'base64');
      if (buf.length < 28) return null;
      const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
      d.setAAD(Buffer.from(String(aad || ''), 'utf8'));
      d.setAuthTag(buf.subarray(12, 28));
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
    } catch (e) {
      return null; // 密钥不符/密文损坏: 该字段视为不可用
    }
  }

  function isEncrypted(text) {
    return typeof text === 'string' && text.startsWith(PREFIX);
  }

  return { encrypt, decrypt, isEncrypted, key };
}

module.exports = { createCrypto, decodeKey, loadMasterKeyFromSecret, resolveMasterKey };
