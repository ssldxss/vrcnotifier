const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDb } = require('../src/db');
const { resolveAccessToken } = require('../src/index');

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

test('resolveAccessToken generates once and reuses from database', () => {
  const db = createDb(':memory:');
  const t1 = resolveAccessToken(db, ':memory:', silent);
  assert.ok(t1.length >= 20);
  assert.equal(db.getSetting('access_token'), t1);
  const t2 = resolveAccessToken(db, ':memory:', silent);
  assert.equal(t2, t1);
});

test('resolveAccessToken 只认数据库: env/secret 文件均被忽略, 库中令牌优先', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcn-tokdb-'));
  const dbPath = path.join(dir, 'db.sqlite');
  process.env.ACCESS_TOKEN = 'env-token-123';
  try {
    const db = createDb(dbPath);
    db.setSetting('access_token', 'db-token-000');
    const t = resolveAccessToken(db, dbPath, silent);
    assert.equal(t, 'db-token-000');
    assert.equal(db.getSetting('access_token'), 'db-token-000');
  } finally {
    delete process.env.ACCESS_TOKEN;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
});

test('resolveAccessToken migrates legacy token.txt into database and removes file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrcn-tok-'));
  const dbPath = path.join(dir, 'db.sqlite');
  const legacy = path.join(dir, 'token.txt');
  fs.writeFileSync(legacy, 'legacy-token-456\n');
  try {
    const db = createDb(dbPath);
    const t = resolveAccessToken(db, dbPath, silent);
    assert.equal(t, 'legacy-token-456');
    assert.equal(db.getSetting('access_token'), 'legacy-token-456');
    assert.equal(fs.existsSync(legacy), false);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
});
