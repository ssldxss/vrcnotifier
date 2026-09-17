const test = require('node:test');
const assert = require('node:assert');
const { formatLocalTime, createLogger, setLogStream, getLogStream, withDeadline, avatarFields } = require('../src/util');
const { createLogStream } = require('../src/logstream');

test('formatLocalTime returns local YYYY-MM-DD HH:mm:ss', () => {
  const d = new Date(2026, 0, 2, 3, 4, 5); // local
  const s = formatLocalTime(d.getTime());
  assert.match(s, /^2026-01-02 03:04:05$/);
});

test('createLogger prefixes timestamp and level', () => {
  const out = [];
  const log = createLogger('test', (s) => out.push(s));
  log.info('hello %s', 'x');
  assert.equal(out.length, 1);
  assert.match(out[0], /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[info\] \[test\] hello %s x$/);
});

test('createLogger supports debug level with the same line format', () => {
  const out = [];
  const log = createLogger('test', (s) => out.push(s));
  log.debug('每帧消息 %s', 'ws');
  assert.equal(out.length, 1);
  assert.match(out[0], /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[debug\] \[test\] 每帧消息 %s ws$/);
});

test('createLogger pushes lines to global log stream when set', () => {
  const stream = createLogStream();
  const prev = getLogStream();
  try {
    setLogStream(stream);
    const log = createLogger('test', () => {});
    log.warn('注意 %s', 'A');
    log.error('出错 %s', 'B');
    assert.equal(stream.size(), 2);
    assert.match(stream.tail(10)[0].line, /\[warn\] \[test\] 注意 %s A$/);
    assert.match(stream.tail(10)[1].line, /\[error\] \[test\] 出错 %s B$/);
  } finally {
    setLogStream(prev);
  }
});

test('getLogStream returns null by default', () => {
  assert.equal(getLogStream(), null);
});

// ---------- withDeadline: "等待是需求方的事" 的落地工具 ----------

test('withDeadline: 原 Promise 先完成就用它的结果, 不等满时限', async () => {
  const t0 = Date.now();
  const r = await withDeadline(Promise.resolve('按时回来了'), 5000, () => '兜底值');
  assert.equal(r, '按时回来了');
  assert.ok(Date.now() - t0 < 200, '不该等满 5 秒');
});

// 防跑飞: 时限机制若失效, 2 秒后返回哨兵让断言【干净失败】, 而不是把测试挂死
const guard = (p, ms = 2000) => Promise.race([p, new Promise((r) => setTimeout(() => r('<时限机制失效: 一直没返回>'), ms))]);

test('withDeadline: 超过时限就用 onTimeout 的结果', async () => {
  const never = new Promise(() => {}); // 永不完成
  const t0 = Date.now();
  const r = await guard(withDeadline(never, 120, () => '兜底值'));
  assert.equal(r, '兜底值');
  assert.ok(Date.now() - t0 >= 100, '确实等到了时限附近');
});

test('withDeadline: onTimeout 也可以直接给值(不必是函数)', async () => {
  assert.equal(await guard(withDeadline(new Promise(() => {}), 50, '固定兜底')), '固定兜底');
});

test('withDeadline: 超时不会取消原 Promise —— 它仍在后台跑完并写进缓存', async () => {
  let done = null;
  const slow = new Promise((res) => setTimeout(() => { done = '迟到的结果'; res(done); }, 300));
  assert.equal(await withDeadline(slow, 30, () => '先给兜底'), '先给兜底');
  assert.equal(done, null, '时限那一刻原 Promise 还没完成');
  await slow; // 不取消, 继续跑
  assert.equal(done, '迟到的结果', '原 Promise 照常完成');
});

test('withDeadline: 超时后清理定时器, 不留残余句柄', async () => {
  // 用 fake setTimeout 计数: 正常完成的分支必须 clearTimeout
  const realSet = global.setTimeout, realClear = global.clearTimeout;
  let armed = 0, cleared = 0;
  global.setTimeout = (...a) => { armed++; return realSet(...a); };
  global.clearTimeout = (...a) => { cleared++; return realClear(...a); };
  try {
    assert.equal(await withDeadline(Promise.resolve('快'), 5000, () => '兜底'), '快');
    assert.equal(armed, 1, '挂了一个定时器');
    assert.equal(cleared, 1, '正常完成时把它清掉了');
  } finally {
    global.setTimeout = realSet;
    global.clearTimeout = realClear;
  }
});

// ---------- avatarFields: 全项目唯一的头像取值规则 ----------
// 背景(真机实测 2026-09-17): VRChat 好友对象只剩 iconUrl 是"契约内"字段
// (LimitedUserFriend 声明); currentAvatarImageUrl 是实际多返回但未声明的字段;
// currentAvatarThumbnailImageUrl 与 profilePicOverrideThumbnail 已不再返回。
// WS 推送的 user 对象更瘦: 25 个字段里只有 iconUrl 一个图片字段。

test('avatarFields: 优先 iconUrl —— 两个通道唯一都有的字段', () => {
  const r = avatarFields({
    iconUrl: 'https://api.vrchat.cloud/api/1/image/file_icon/1/256',
    currentAvatarImageUrl: 'https://api.vrchat.cloud/api/1/image/file_av/1/256'
  });
  assert.equal(r.avatarUrl, 'https://api.vrchat.cloud/api/1/image/file_icon/1/256');
});

test('avatarFields: 没有 iconUrl 时退回 currentAvatarImageUrl', () => {
  const r = avatarFields({ currentAvatarImageUrl: 'https://api.vrchat.cloud/api/1/image/file_av/2/256' });
  assert.equal(r.avatarUrl, 'https://api.vrchat.cloud/api/1/image/file_av/2/256');
});

test('avatarFields: iconUrl 是空串时也退回(VRChat 对未设置的图片字段回空串)', () => {
  const r = avatarFields({ iconUrl: '', currentAvatarImageUrl: 'https://api.vrchat.cloud/api/1/image/file_av/3/256' });
  assert.equal(r.avatarUrl, 'https://api.vrchat.cloud/api/1/image/file_av/3/256');
});

test('avatarFields: 两个都没有就是 null, 不抛错', () => {
  assert.equal(avatarFields({}).avatarUrl, null);
  assert.equal(avatarFields(null).avatarUrl, null);
  assert.equal(avatarFields(undefined).avatarUrl, null);
});

test('avatarFields: 真实 WS user 形状(25 字段, 只有 iconUrl)也能出图', () => {
  // 形状取自真机抓到的 friend-online / friend-update 内层 user 对象
  const wsUser = {
    id: 'usr_ws', displayName: '朋友usr_ws', iconUrl: 'https://api.vrchat.cloud/api/1/image/file_ws/7/256',
    iconFrame: '', profileEffect: '', nameplateEffect: '', bannerType: 'color', bannerUrl: '',
    isEconomyCreator: false, statusDescription: '', pronouns: '', ageVerificationStatus: 'hidden',
    ageVerified: false, state: 'offline', last_mobile: null, tags: [],
    developerType: 'none', last_login: '2026-09-01T00:00:00Z', last_platform: 'standalonewindows',
    allowAvatarCopying: true, status: 'active', date_joined: '2024-01-01T00:00:00Z',
    isFriend: true, friendKey: '', last_activity: ''
  };
  assert.equal(avatarFields(wsUser).avatarUrl, 'https://api.vrchat.cloud/api/1/image/file_ws/7/256');
});

test('avatarFields: 已失效的缩略图字段不再作为来源', () => {
  const r = avatarFields({
    currentAvatarThumbnailImageUrl: 'https://api.vrchat.cloud/api/1/image/file_dead/1/256',
    profilePicOverrideThumbnail: 'https://api.vrchat.cloud/api/1/image/file_dead2/1/256'
  });
  assert.equal(r.avatarUrl, null, '这两个字段已不再返回, 读到它们等于读到空');
  assert.ok(!('avatarThumbUrl' in r), '不再产出缩略图字段(该列已删除)');
});
