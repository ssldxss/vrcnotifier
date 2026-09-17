'use strict';
// 版本号的唯一计算处。约定: **git tag 是唯一真相**(见 .github/workflows/release.yml)。
//
//  - nextVersion(): release workflow 每次 push 到 main 用它算出下一个版本并打 tag;
//  - currentVersion(): 程序对外报的版本 —— 镜像构建时把该 tag 版本作为 APP_VERSION 注入,
//    于是"镜像里报的版本 == git tag == Docker tag"; 本地 npm start 则回落到 package.json。
//
// 以前版本号有两份(package.json 与 src/server.js 里写死的 '0.1.0'), 这里收敛成一份。
const pkg = require('../package.json');

const TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;

/** tag 名 -> [major, minor, patch]; 不合法返回 null */
function parseTag(name) {
  const m = TAG_RE.exec(String(name == null ? '' : name).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** 三元组比较: a>b 正数, 相等 0, a<b 负数。必须按数字比 —— 按字符串比会把 v0.1.9 排到 v0.1.10 前面。 */
function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * 从已有 tag 名列表算出下一个 patch 版本(不带 v 前缀)。
 * 忽略所有非 v<数字>.<数字>.<数字> 形态的 tag(中文名、无 v 前缀、预发布后缀等)。
 * 一个合法 tag 都没有时, 以 baseVersion 为起点 patch +1。
 */
function nextVersion(tagNames, baseVersion = pkg.version) {
  let highest = parseTag('v' + baseVersion) || [0, 0, 0];
  for (const name of Array.isArray(tagNames) ? tagNames : []) {
    const v = parseTag(name);
    if (v && compare(v, highest) > 0) highest = v;
  }
  return `${highest[0]}.${highest[1]}.${highest[2] + 1}`;
}

/** 本程序对外报的版本: APP_VERSION(镜像构建时注入) 优先, 否则 package.json 的版本。 */
function currentVersion(env = process.env) {
  const injected = env ? env.APP_VERSION : null;
  return injected ? String(injected) : pkg.version;
}

// CLI: 从 stdin 逐行读 tag 名并打印下一个版本。
// workflow 用法: git tag -l 'v*' | node src/version.js
if (require.main === module) {
  const input = require('node:fs').readFileSync(0, 'utf8');
  process.stdout.write(nextVersion(input.split('\n')) + '\n');
}

module.exports = { nextVersion, currentVersion };
