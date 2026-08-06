const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDb } = require('../src/db');
const { resolveAccessToken } = require('../src/index');

const silent = { info: () => {}, warn: () => {}, error: () => {} };

test('resolveAccessToken generates once and reuses from database', () => {
  const db = createDb(':memory:');
  const t1 = resolveAccessToken(db, ':memory:', silent);
  assert.ok(t1.length >= 20);
  assert.equal(db.getSetting('access_token'), t1);
  const t2 = resolveAccessToken(db, ':memory:', silent);
  assert.equal(t2, t1);
});

test('resolveAccessToken prefers ACCESS_TOKEN env and does not persist it', () => {
  process.env.ACCESS_TOKEN = 'env-token-123';
  try {
    const db = createDb(':memory:');
    const t = resolveAccessToken(db, ':memory:', silent);
    assert.equal(t, 'env-token-123');
    assert.equal(db.getSetting('access_token'), null);
  } finally {
    delete process.env.ACCESS_TOKEN;
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
