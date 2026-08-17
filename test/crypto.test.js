'use strict';
// 数据加密测试: AES-256-GCM 往返 / AAD 绑定 / 密钥错误 / Docker Secret 读取。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createCrypto, decodeKey, loadMasterKeyFromSecret, resolveMasterKey } = require('../src/crypto');

test('AES-256-GCM 往返: 加密后带 v1: 前缀, 解密还原原文', () => {
  const key = crypto.randomBytes(32);
  const c = createCrypto({ masterKey: key });
  const blob = c.encrypt('my-password-123', 'password:7');
  assert.ok(blob.startsWith('v1:'));
  assert.notEqual(blob, 'v1:'); // 密文不与明文相同
  assert.equal(c.decrypt(blob, 'password:7'), 'my-password-123');
});

test('同一明文两次加密密文不同(随机 IV)', () => {
  const c = createCrypto({ masterKey: crypto.randomBytes(32) });
  assert.notEqual(c.encrypt('x', 'a'), c.encrypt('x', 'a'));
});

test('AAD 绑定: 换字段/换行解密失败', () => {
  const c = createCrypto({ masterKey: crypto.randomBytes(32) });
  const blob = c.encrypt('secret', 'password:1');
  assert.equal(c.decrypt(blob, 'password:2'), null);
  assert.equal(c.decrypt(blob, 'cookie_data:1'), null);
});

test('密钥不符: 解密返回 null; 明文直通(未上线无迁移负担)', () => {
  const a = createCrypto({ masterKey: crypto.randomBytes(32) });
  const b = createCrypto({ masterKey: crypto.randomBytes(32) });
  const blob = a.encrypt('pw', 'password:1');
  assert.equal(b.decrypt(blob, 'password:1'), null);
  assert.equal(b.decrypt('plaintext-old', 'password:1'), 'plaintext-old');
});

test('isEncrypted 前缀识别', () => {
  const c = createCrypto({ masterKey: crypto.randomBytes(32) });
  assert.equal(c.isEncrypted(c.encrypt('x', 'a')), true);
  assert.equal(c.isEncrypted('x'), false);
  assert.equal(c.isEncrypted(null), false);
});

test('decodeKey: 64 位 hex / 32B base64; 非法格式报错', () => {
  assert.equal(decodeKey('ab'.repeat(32)).length, 32);
  const b64 = crypto.randomBytes(32).toString('base64');
  assert.equal(decodeKey(b64).length, 32);
  assert.throws(() => decodeKey('short'));
  assert.throws(() => decodeKey(''));
});

test('loadMasterKeyFromSecret: 读取 secret 文件内容并解码', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcn-secret-'));
  try {
    const file = path.join(dir, 'master_key');
    fs.writeFileSync(file, 'cd'.repeat(32), 'utf8'); // 64 位 hex
    const key = loadMasterKeyFromSecret(file);
    assert.equal(key.length, 32);
    assert.throws(() => loadMasterKeyFromSecret(path.join(dir, 'nope')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveMasterKey 优先级: dev > secret > env > missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcn-resolve-'));
  try {
    const file = path.join(dir, 'master_key');
    fs.writeFileSync(file, 'ab'.repeat(32), 'utf8');
    // 1) 开发模式: 不读任何密钥
    assert.deepEqual(resolveMasterKey({ secretFile: file, envKey: 'cd'.repeat(32), devNoEncrypt: true }), { key: null, mode: 'none' });
    // 2) Secret 优先于环境变量
    const s = resolveMasterKey({ secretFile: file, envKey: 'cd'.repeat(32) });
    assert.equal(s.mode, 'docker-secret');
    assert.equal(s.key.subarray(0, 1).toString('hex'), 'ab');
    // 3) 无 Secret 时用环境变量
    const e = resolveMasterKey({ secretFile: path.join(dir, 'nope'), envKey: 'cd'.repeat(32) });
    assert.equal(e.mode, 'env');
    assert.equal(e.key.subarray(0, 1).toString('hex'), 'cd');
    // 4) 都没有 → missing
    assert.deepEqual(resolveMasterKey({ secretFile: path.join(dir, 'nope'), envKey: null }), { key: null, mode: 'missing' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
