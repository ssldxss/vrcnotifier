'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { migrateDatabase, SCHEMA_VERSION } = require('../src/migrations');

test('migrations version the database and repeated startup does no history writes or DDL', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  migrateDatabase(db);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, SCHEMA_VERSION);
  db.exec("INSERT INTO friend_logs(at,type) VALUES(1,'boop')");
  db.exec("CREATE TRIGGER protect_history BEFORE UPDATE ON friend_logs BEGIN SELECT RAISE(ABORT,'history was scanned for updates'); END");
  const version = db.prepare('PRAGMA schema_version').get().schema_version;
  const changes = db.prepare('SELECT total_changes() n').get().n;
  migrateDatabase(db);
  migrateDatabase(db);
  assert.equal(db.prepare('PRAGMA schema_version').get().schema_version, version);
  assert.equal(db.prepare('SELECT total_changes() n').get().n, changes);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM friend_logs').get().n, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('migration failure rolls back all steps and their version, retaining the original data', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec("CREATE TABLE friend_events(id INTEGER PRIMARY KEY, marker TEXT); INSERT INTO friend_events VALUES(7,'keep'); CREATE TABLE friend_logs(id INTEGER PRIMARY KEY)");
  assert.throws(() => migrateDatabase(db), /改名冲突/);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 0);
  assert.equal(db.prepare('SELECT marker FROM friend_events WHERE id=7').get().marker, 'keep');
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='users'").get(), undefined, 'core migration rolled back too');
});

test('a database from a newer application is rejected without downgrade', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec('PRAGMA user_version = 999');
  assert.throws(() => migrateDatabase(db), /高于/);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 999);
});
