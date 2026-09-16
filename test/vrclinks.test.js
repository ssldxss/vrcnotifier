'use strict';
// 前端外链构造(纯函数, 供 app.js 与 Node 测试共用)。
// 重点覆盖两件事:
//   1) id 白名单校验 —— 服务端数据拼进 data-href 前必须挡住注入, 非法时退化为纯文本;
//   2) 形态固定为 span[data-href] 而非 <a> —— 不用超链接, 避免点击后焦点残留把行高亮卡住。

const test = require('node:test');
const assert = require('node:assert');
const vrclinks = require('../public/vrclinks');

const USR = 'usr_ff49a500-5855-48ce-bc00-83b822440825';
const WRLD = 'wrld_0777ec10-c871-4e2f-91cc-1c43287eb16c';

test('vrclinks: userUrl 合法 usr_ id → VRChat 个人页', () => {
  assert.equal(vrclinks.userUrl(USR), 'https://vrchat.com/home/user/' + USR);
});

test('vrclinks: worldUrl 合法 wrld_ id → VRChat 世界页', () => {
  assert.equal(vrclinks.worldUrl(WRLD), 'https://vrchat.com/home/world/' + WRLD);
});

test('vrclinks: 非法 id → null(不生成链接)', () => {
  for (const bad of [
    null, undefined, '', '   ',
    'private',                  // 哨兵: 私密世界
    'offline',
    'usr_',                     // 只有前缀
    'wrld_',                    // 只有前缀
    'avtr_0777ec10',            // 别的实体类型
    'usera_badprefix',          // 前缀不完全匹配
    'group_abc'
  ]) {
    assert.equal(vrclinks.userUrl(bad), null, 'userUrl(' + JSON.stringify(bad) + ')');
    assert.equal(vrclinks.worldUrl(bad), null, 'worldUrl(' + JSON.stringify(bad) + ')');
  }
});

test('vrclinks: 跨类型混用被挡住(usr_ 当世界、wrld_ 当用户)', () => {
  assert.equal(vrclinks.worldUrl(USR), null);
  assert.equal(vrclinks.userUrl(WRLD), null);
});

test('vrclinks: 只校验格式, 不校验存在性(截断但形状合法的 id 仍生成链接)', () => {
  // 截断后的 'usr_ff49' 形状合法 → 生成链接, 由 VRChat 那边 404。
  // 这里显式固定该语义: 前端只挡注入, 不做存在性判断。
  assert.equal(vrclinks.userUrl('usr_ff49'), 'https://vrchat.com/home/user/usr_ff49');
});

test('vrclinks: href 注入尝试一律拒绝', () => {
  const attacks = [
    'javascript:alert(1)',
    "usr_x' onmouseover='alert(1)",
    'usr_x"><script>alert(1)</script>',
    'usr_x onmouseover=alert(1)',
    'usr_x/traverse',
    'usr_x?next=evil',
    'usr_x#frag',
    'usr_x&y=1',
    'usr_中文',
    'usr_x\ny'
  ];
  for (const a of attacks) {
    assert.equal(vrclinks.userUrl(a), null, JSON.stringify(a));
    // 更要紧的是: 渲染出来不能带可点标记
    assert.ok(!vrclinks.linkHtml('user', a, 'x').includes('ext-link'), JSON.stringify(a));
  }
});

test('vrclinks: linkHtml 合法 id → span[data-href], 不用超链接', () => {
  const html = vrclinks.linkHtml('user', USR, '喵杂鱼');
  assert.equal(
    html,
    "<span class='ext-link' data-href='https://vrchat.com/home/user/" + USR +
    "' title='在 VRChat 网页打开个人资料'>喵杂鱼</span>"
  );
  // 关键: 不能是 <a>(可聚焦 → .friend:focus-within 会卡住行高亮), 也不需要 target/rel
  assert.ok(!html.includes('<a'));
  assert.ok(!html.includes(' href=')); // 前面是空格的裸 href; data-href 不算
  assert.ok(!html.includes('target='));
});

test('vrclinks: linkHtml 世界链接', () => {
  const html = vrclinks.linkHtml('world', WRLD, 'The Black Cat');
  assert.ok(html.startsWith("<span class='ext-link' data-href='https://vrchat.com/home/world/" + WRLD + "'"));
  assert.ok(html.includes("title='在 VRChat 网页打开世界页面'"));
  assert.ok(html.endsWith('>The Black Cat</span>'));
});

test('vrclinks: 非法 id → 纯转义文本, 不可点', () => {
  assert.equal(vrclinks.linkHtml('user', null, '无 id'), '无 id');
  assert.equal(vrclinks.linkHtml('world', 'private', '私密世界'), '私密世界');
  assert.equal(vrclinks.linkHtml('user', '', '<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;');
});

test('vrclinks: 名称里的 HTML 被转义', () => {
  const html = vrclinks.linkHtml('user', USR, '<img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  // 标签本身只有我们生成的那一个 <span>
  assert.equal(html.split('<span').length - 1, 1);
});

test('vrclinks: 名称里的 & 与尖括号转义正确', () => {
  assert.equal(vrclinks.linkHtml('user', null, 'A & B < C > D'), 'A &amp; B &lt; C &gt; D');
});

test('vrclinks: 未知 kind 不生成链接', () => {
  assert.equal(vrclinks.linkHtml('group', 'grp_abc', '群组'), '群组');
  assert.equal(vrclinks.linkHtml(undefined, USR, 'x'), 'x');
});

test('vrclinks: wrapHtml 合法 id 包一层, 内容原样嵌入(头像用)', () => {
  const inner = "<img class=avatar src='/api/avatar/k'>";
  const html = vrclinks.wrapHtml('user', USR, inner);
  assert.ok(html.startsWith("<span class='ext-link' data-href='https://vrchat.com/home/user/" + USR + "'"));
  assert.ok(html.endsWith('>' + inner + '</span>'));
  // img 与字首兜底必须留在同一层: app.js 的 onerror 依赖 nextElementSibling
  assert.ok(!html.includes('</span><'));
});

test('vrclinks: wrapHtml 非法 id → 内容原样返回', () => {
  const inner = "<div class='avatar-fallback'>A</div>";
  assert.equal(vrclinks.wrapHtml('user', null, inner), inner);
});
