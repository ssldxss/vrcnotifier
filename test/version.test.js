// 版本号规则: 全项目唯一的版本计算处。
//
// 背景: 版本号原先有两份(package.json 与 src/server.js 硬编码), 且没有任何自动化,
// 导致镜像是手动触发、latest 会滞后好几天。现在约定"git tag 是唯一真相":
//   - release workflow 每次 push 到 main 用 nextVersion() 算出下一个版本并打 tag;
//   - 镜像构建时把版本作为 APP_VERSION 注入, currentVersion() 优先读它。
const test = require('node:test');
const assert = require('node:assert');
const { nextVersion, currentVersion } = require('../src/version');

// ---------- nextVersion: 从已有 tag 名算下一个版本 ----------
// 只认 v<数字>.<数字>.<数字> 形态, 其余(中文名 tag、无 v 前缀、预发布等)一律忽略。

test('nextVersion: 没有任何 tag 时, 从 baseVersion 起 patch +1', () => {
  assert.equal(nextVersion([], '0.1.0'), '0.1.1');
});

test('nextVersion: 单个 tag 之后 patch +1', () => {
  assert.equal(nextVersion(['v0.1.1'], '0.1.0'), '0.1.2');
});

test('nextVersion: 取最高的那个 tag, 而不是最后一个', () => {
  assert.equal(nextVersion(['v0.1.1', 'v0.2.0', 'v0.1.9'], '0.1.0'), '0.2.1');
});

test('nextVersion: 按数字比较, 不是字典序(0.1.10 比 0.1.9 新)', () => {
  assert.equal(nextVersion(['v0.1.9', 'v0.1.10'], '0.1.0'), '0.1.11');
});

test('nextVersion: 忽略非法 tag(中文名/无 v 前缀/格式不对)', () => {
  assert.equal(nextVersion(['头像缓存优化', 'v0.1.1', '不是版本', '0.3.0', 'v0.1'], '0.1.0'), '0.1.2');
});

test('nextVersion: 手动提过 minor 之后继续自动 +1', () => {
  assert.equal(nextVersion(['v1.0.0', 'v0.9.9'], '0.1.0'), '1.0.1');
});

test('nextVersion: 全是非法 tag 时等价于没有 tag', () => {
  assert.equal(nextVersion(['v1', 'v1.2', 'whatever'], '0.1.0'), '0.1.1');
});

test('nextVersion: 输入里的空行与两侧空白被忽略(workflow 用 stdin 逐行喂)', () => {
  assert.equal(nextVersion(['', '  v0.1.3  ', '\n', 'v0.1.4'], '0.1.0'), '0.1.5');
});

// ---------- currentVersion: 本程序对外报的版本 ----------

test('currentVersion: APP_VERSION 优先(镜像构建时注入 tag 版本)', () => {
  assert.equal(currentVersion({ APP_VERSION: '9.9.9' }, '0.1.0'), '9.9.9');
});

test('currentVersion: 没有 APP_VERSION 就用 package.json 的版本', () => {
  assert.equal(currentVersion({}, '0.1.0'), '0.1.0');
});

test('currentVersion: APP_VERSION 是空串时当作没给', () => {
  assert.equal(currentVersion({ APP_VERSION: '' }, '0.1.0'), '0.1.0');
});
