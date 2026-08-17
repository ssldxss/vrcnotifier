'use strict';
// 数据加密: AES-256-GCM + AAD 绑定(字段:行ID, 防密文跨行/跨字段置换)。
// 主密钥仅来自 Docker Secrets(/run/secrets/vrcnotifier_master_key), 不备份、不进镜像/环境变量;
// 换环境(密钥不同)时密文解密失败 → 由启动流程静默清库重启(见 index.js)。
// 密文格式: v1:<base64(iv|tag|cipher)>; 无前缀的旧值按明文直通(尚未上线, 无需迁移)。

const crypto = require('node:crypto');

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

/**
 * 密钥来源优先级: Docker Secret → 环境变量 MASTER_KEY → 开发模式(--no-encrypt, 不加密);
 * 返回 { key, mode }(mode: docker-secret | env | none | missing)。
 */
function resolveMasterKey({ secretFile = '/run/secrets/vrcnotifier_master_key', envKey = null, devNoEncrypt = false } = {}) {
  if (devNoEncrypt) return { key: null, mode: 'none' };
  try {
    return { key: loadMasterKeyFromSecret(secretFile), mode: 'docker-secret' };
  } catch (e) { /* 无 Secret: 尝试环境变量 */ }
  if (envKey) {
    return { key: decodeKey(envKey), mode: 'env' };
  }
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
