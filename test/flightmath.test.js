'use strict';
// 飞跃位移的时间-距离曲线: 时长分档、首尾必须落在 0/1、单调不过冲、巡航段速度等于峰值。
// 抽成模块的原因: 这段纯数学决定了"落点准不准、会不会过冲、短距离看不看得见", 且完全不碰 DOM。

const test = require('node:test');
const assert = require('node:assert');
const f = require('../public/flightmath');

// 把整条曲线按 1ms 采样出来, 便于做单调/边界断言
function samples(p) {
  const out = [];
  for (let t = 0; t <= p.T + 1; t++) out.push({ t, v: f.progress(t, p) });
  return out;
}

test('常量: 峰值速度/加速段/最短最长时长与旧版 FLIP 一致', () => {
  assert.equal(f.PEAK, 7);
  assert.equal(f.ACCEL, 200);
  assert.equal(f.MIN_DUR, 160);
  assert.equal(f.MAX_DUR, 2400);
  assert.ok(Math.abs(f.ACC_DIST - 7 * 200 / 3) < 1e-9);
  assert.equal(f.CRUISE_MIN, 2 * f.ACC_DIST);
});

test('plan: 短距离退化成对称加减速且不短于 MIN_DUR', () => {
  const p = f.plan(100);
  assert.equal(p.cruise, false);
  assert.equal(p.T, f.MIN_DUR);        // 100px 算出来只有 42.8ms, 被抬到 160ms
  assert.equal(p.A, p.T / 2);
  const p2 = f.plan(f.CRUISE_MIN - 1);
  assert.equal(p2.cruise, false);
  assert.ok(p2.T >= f.MIN_DUR && p2.T < 2 * f.ACCEL);
});

test('plan: 恰好等于匀速阈值时走匀速分支且时长就是 2*ACCEL', () => {
  const p = f.plan(f.CRUISE_MIN);
  assert.equal(p.cruise, true);
  assert.ok(Math.abs(p.T - 2 * f.ACCEL) < 1e-9);
  assert.equal(p.A, f.ACCEL);
});

test('plan: 远距离按 7px/ms 加巡航时间, 但封顶 MAX_DUR', () => {
  const d = 2000; // 2*ACC_DIST + 7*1000 → 应比 2*ACCEL 多约 1000ms
  const p = f.plan(d);
  assert.ok(Math.abs(p.T - (2 * f.ACCEL + (d - f.CRUISE_MIN) / f.PEAK)) < 1e-9);
  assert.equal(f.plan(1e6).T, f.MAX_DUR);
  assert.equal(f.plan(1e6).cruise, true);
});

test('plan: 零距离/坏值退化为无动画(d=0), 负数按绝对值处理', () => {
  for (const bad of [0, NaN, undefined, null, 'x']) {
    const p = f.plan(bad);
    assert.equal(p.d, 0);
    assert.equal(f.progress(0, p), 1, 'd=0 时应当"已经到了"');
    assert.equal(f.remain(0, p), 0, 'd=0 时没有残余位移');
  }
  assert.equal(f.plan(-120).d, 120); // 调用方传负号也不该炸
});

test('progress: 首尾必须精确落在 0 与 1(否则会留下残余位移/过冲)', () => {
  for (const d of [1, 50, 100, 466, 933, 2000, 40000, 133000]) {
    const p = f.plan(d);
    assert.equal(f.progress(0, p), 0, 'd=' + d);
    assert.equal(f.progress(p.T, p), 1, 'd=' + d);
    assert.equal(f.progress(p.T + 5000, p), 1, 'd=' + d + ' 超过时长要停在终点');
  }
});

test('progress: 全程单调不减且始终落在 [0,1](不过冲)', () => {
  for (const d of [1, 100, 800, 933, 2000, 40000, 133000]) {
    const p = f.plan(d);
    let prev = -1;
    for (const s of samples(p)) {
      assert.ok(s.v >= prev - 1e-12, 'd=' + d + ' t=' + s.t + ' 回退了: ' + prev + '→' + s.v);
      assert.ok(s.v >= -1e-12 && s.v <= 1 + 1e-12, 'd=' + d + ' t=' + s.t + ' 越界: ' + s.v);
      prev = s.v;
    }
    assert.ok(prev > 1 - 1e-9);
  }
});

test('progress: 加速段慢启动(t³), 起步速度接近 0', () => {
  const p = f.plan(2000);
  const v0 = f.progress(1, p) - f.progress(0, p);
  const vMid = f.progress(400, p) - f.progress(399, p);
  assert.ok(v0 < 0.01, '起步 1ms 内不应有明显位移: ' + v0);
  assert.ok(vMid > v0 * 10, '中段速度应远大于起步: ' + vMid + ' vs ' + v0);
});

test('progress: 匀速段速度恒等于 PEAK, 且总里程恰好等于 d', () => {
  const d = 2000;
  const p = f.plan(d);
  // 匀速段是 [A, T-A], 取它中段的几个区间(d=2000 时 T≈552ms, 匀速段只有 ~132ms)
  assert.ok(p.T - 2 * p.A > 100, '这个距离应当有明显匀速段, T=' + p.T);
  const dt = 20;
  for (const frac of [0.2, 0.4, 0.6]) {
    const t = p.A + 20 + Math.round((frac) * (p.T - 2 * p.A - 40));
    const covered = f.progress(t + dt, p) * d - f.progress(t, p) * d;
    assert.ok(Math.abs(covered / dt - f.PEAK) < 1e-6, 't=' + t + ' 速度=' + covered / dt);
  }
  assert.ok(Math.abs(f.progress(p.T, p) * d - d) < 1e-6);
});

test('progress: 加减速对称(以中点镜像)', () => {
  const p = f.plan(2000);
  for (const t of [10, 50, 100, 199]) {
    const a = f.progress(t, p);
    const b = 1 - f.progress(p.T - t, p);
    assert.ok(Math.abs(a - b) < 1e-9, 't=' + t + ': ' + a + ' vs ' + b);
  }
});

test('progress: 封顶后(超远距离)末尾仍会收敛到 1, 不会卡在半路', () => {
  const p = f.plan(133000); // 真实场景: 列表深处点到顶部特别关注组
  assert.equal(p.T, f.MAX_DUR);
  assert.equal(f.progress(p.T, p), 1);
  assert.ok(f.progress(p.T - 1, p) < 1);
});

test('remain: 恰好是 progress 的补数, 且首尾为 1/0', () => {
  for (const d of [10, 933, 5000]) {
    const p = f.plan(d);
    assert.equal(f.remain(0, p), 1);
    assert.equal(f.remain(p.T, p), 0);
    for (const t of [0, 1, 77, 300, p.T]) {
      assert.ok(Math.abs(f.remain(t, p) - (1 - f.progress(t, p))) < 1e-12);
    }
  }
});

test('plan: 距离越远飞得越久(单调)', () => {
  let prev = 0;
  for (const d of [10, 100, 466, 933, 1200, 3000, 9000, 60000]) {
    const T = f.plan(d).T;
    assert.ok(T >= prev, 'd=' + d + ' T=' + T + ' 比更近的 ' + prev + ' 还短');
    prev = T;
  }
});
