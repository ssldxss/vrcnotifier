'use strict';
// 登录等待页(全屏遮罩 + 四行步骤 + 百分比里程表 + 首屏头像等待)。
// 从 app.js 拆出; 纯计算在 bootmath.js(有单测)。
// 本文件仍是传统脚本、函数保持全局, 所以 app.js 里的调用点无需改动。

// ---------- 登录等待页 ----------
// 时机全部由后端 SSE 决定: 「验证通过」才淡入(不是点提交就出现), 「取到实时连接凭据」点亮第 1 行,
// 「读到好友名册」点亮第 2 行; 第 3 行按实际拉取条数追赶百分比; 响应回来后才等前端就绪(第 4 行)。
// 这块展板只读事件、绝不用事件决定跳转 —— 跳转仍由 /api/login 的响应决定,
// 所以丢事件/断线最坏只是少点亮一格, 不会把人卡在等待页。
const BOOT_MIN_STEP_MS = 550;   // 每行最短停留: 登录再快也要把这一步放完
const BOOT_READY_MIN_MS = 1200; // 「等待前端就绪」最少停留(数据/头像再快也别一闪而过)
const BOOT_READY_MS = 10000;    // 该行总上限(超时): 主界面数据 + 首屏头像, 到点就走
const BOOT_PCT_NUM_MS = 4;      // 百分比: 每个数字 4ms(约 250 个/秒)连续 +1 滚过去, 不等屏幕逐帧显示
const BOOT_PCT_DRAW_MS = 30;    // 数字条的渲染节流: 滚一格要 0.18s, 每帧都改会糊成一团
const BOOT_HOLD_DONE_MS = 1200; // 「初始化完成」停留
const BOOT_FADE_MS = 900;       // 淡出时长(与 CSS .boot-screen.out 一致)
const BOOT_STEPS = ['bootStep0', 'bootStep1', 'bootStep2', 'bootStep3'];
let bootActive = false;         // 等待页是否在场(在场时展板才理会进度事件)
let bootPointer = -1;           // 当前正在跑的是第几行(黄字)
let bootStepAt = 0;             // 该行开始时间(最短停留用)
let bootMarks = [false, false, false, false]; // 各行的真实完成标记
let bootPctShown = 0;           // 已展示到的整数百分比
let bootPctTarget = null;       // 真实百分比; null = 一条真实进度都没收到 → 不显示(不编数字)
let bootPctFrom = 0;            // 本轮滚动起点
let bootPctAt = 0;              // 本轮滚动起点时刻
let bootPctRaf = null;          // 逐数滚动的 rAF 句柄
let bootPctRenderedAt = 0;      // 上次渲染数字条的时刻(节流用)
const bootHalos = new Map();    // 各行光环的 WAAPI 动画句柄(完成时要收到最小并停住)
let bootReadyText = '';         // 第 4 行右侧的"头像 x/y"(算完了也要等轮到自己才显示)
let bootTimer = null;           // 推进定时器
let bootHideTimer = null;       // 淡出收尾定时器
let bootToken = 0;              // 每次显示自增: 上一轮的异步回调据此作废
let loginWaiting = false;       // 正在等某个登录请求的响应(只有这时才理会 verified)

function bootSleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// 滚跳(与 WS 计数同款): 旧值向上滚出、新值从下滚入。CJK 不适用 ch 定宽, 由 .roll-wrap 裁剪。
function rollSwap(el, text, force) {
  if (!el || (!force && el.textContent === String(text))) return;
  const wrap = el.parentElement;
  if (!wrap) { el.textContent = String(text); return; }
  for (const old of wrap.querySelectorAll(':scope > .roll-old')) old.remove();
  const old = document.createElement('span');
  old.className = 'roll-old';
  old.textContent = el.textContent;
  el.textContent = String(text);
  el.getAnimations().forEach((a) => a.cancel()); // 打断进行中的动画, 避免叠加抖动
  el.classList.remove('roll');
  void el.offsetWidth;                            // 强制重排, 重启动画
  el.classList.add('roll');
  wrap.appendChild(old);
  old.addEventListener('animationend', () => old.remove(), { once: true });
  setTimeout(() => old.remove(), 600);            // 兜底: 动画被打断也不会留下残留层
}

function bootShow() {
  if (bootActive) return;
  bootActive = true;
  bootToken++;
  bootPointer = 0;
  bootStepAt = Date.now();
  bootMarks = [false, false, false, false];
  bootPctShown = 0;
  bootPctFrom = 0;
  bootPctAt = 0;
  bootPctTarget = null;       // 没有真实进度就一直是 null: 界面上不出现任何数字
  bootReadyText = '';
  if (bootPctRaf) { cancelAnimationFrame(bootPctRaf); bootPctRaf = null; }
  const pctBox = $('#bootPct');
  pctBox.dataset.ready = '';   // 上一轮的数字条丢掉: 没到第 3 行之前这一格必须是空的
  pctBox.innerHTML = '';
  $('#bootStep3 .boot-val').textContent = ''; // 上一轮留下的"头像 x/y"要清掉
  $('#bootTitle').textContent = '正在初始化';
  $('#bootTitleWrap').classList.remove('done');
  for (const id of BOOT_STEPS) $('#' + id).classList.remove('on', 'ok');
  bootHalosReset();           // 上一轮的光环动画(含填充效果)清干净
  bootSetStep(0, 'on');       // 第 1 行立刻转黄(走同一套: 光环开始呼吸)
  const scr = $('#bootScreen');
  scr.classList.remove('hidden', 'out');
  void scr.offsetWidth; // 强制重排: 让 opacity 过渡从 0 开始
  scr.classList.add('show');
  if (!bootTimer) bootTimer = setInterval(bootTick, 60);
}

function bootHide(immediate) {
  if (!bootActive) return;
  bootActive = false;
  bootToken++;
  if (bootTimer) { clearInterval(bootTimer); bootTimer = null; }
  if (bootPctRaf) { cancelAnimationFrame(bootPctRaf); bootPctRaf = null; }
  if (bootHideTimer) { clearTimeout(bootHideTimer); bootHideTimer = null; }
  const scr = $('#bootScreen');
  scr.classList.remove('show');
  const finish = () => { scr.classList.add('hidden'); scr.classList.remove('out'); };
  if (immediate) { finish(); return; }
  scr.classList.add('out');
  bootHideTimer = setTimeout(finish, BOOT_FADE_MS);
}

function bootMark(i) { bootMarks[i] = true; }

// 真实进度: 只认后端报的已拉条数/总数, 一条都没收到就不显示(绝不自己编一个终值)
function bootPercent(fetched, total) {
  const target = VrcBootMath.percentTarget(fetched, total); // 向下取整不虚报; 总数非法 → null
  if (target === null) return;
  if (!VrcBootMath.shouldAdvance(bootPctTarget, target)) return; // 只增不减
  bootPctTarget = target;
  bootPctKick();
}

// 每个数字都要走一遍: 按时间推进(每 BOOT_PCT_NUM_MS 一个数, 序列恒为 +1),
// 屏幕刷新率跟不上也没关系 —— 追到真实值就停在那, 等下一页来了再继续。
function bootPctKick() {
  if (bootPctRaf || !bootActive) return;
  bootPctFrom = bootPctShown;      // 本轮起点与起点时刻: 用经过的时间算该走到哪
  bootPctAt = performance.now();
  bootPctRaf = requestAnimationFrame(bootPctStep);
}
function bootPctStep() {
  bootPctRaf = null;
  if (!bootActive || bootPctTarget === null) return;
  if (bootPctShown >= bootPctTarget) { bootPctRender(bootPctShown); return; } // 到值: 落定, 停
  const want = VrcBootMath.odometerWant(bootPctFrom, performance.now() - bootPctAt, BOOT_PCT_NUM_MS, bootPctTarget);
  bootPctShown = want;
  // 渲染节流: 数字条滚一格要 0.18s, 每帧都改反而糊成一团; 到值时上面那条保证一定落定
  if (bootPointer >= 2 && performance.now() - bootPctRenderedAt >= BOOT_PCT_DRAW_MS) {
    bootPctRenderedAt = performance.now();
    bootPctRender(bootPctShown);
  }
  bootPctRaf = requestAnimationFrame(bootPctStep);
}

// 百分比的滚动里程表: 建 3 个数字位(百/十/个), 每位一条 0-9 竖排的数字条。
// 换数字只改 transform, 交给 transition 平滑滚过去 —— 既不重排文字, 也不会重启关键帧动画。
function bootPctBuild() {
  const box = $('#bootPct');
  if (!box) return;
  box.innerHTML = '';
  box.dataset.ready = '1';
  for (const role of ['h', 't', 'o']) {
    const slot = document.createElement('span');
    slot.className = 'pct-slot dim';
    slot.dataset.role = role;
    const strip = document.createElement('b');
    strip.className = 'pct-strip';
    for (let d = 0; d <= 9; d++) {
      const i = document.createElement('i');
      i.textContent = String(d);
      strip.appendChild(i);
    }
    slot.appendChild(strip);
    box.appendChild(slot);
  }
  const sign = document.createElement('span');
  sign.className = 'pct-sign';
  sign.textContent = '%';
  box.appendChild(sign);
}
function bootPctRender(n, instant) {
  const box = $('#bootPct');
  if (!box || box.dataset.ready !== '1') return;
  const v = Math.max(0, Math.min(100, Math.round(n)));
  const digits = String(v).padStart(3, '0');
  const roles = ['h', 't', 'o'];
  for (let i = 0; i < roles.length; i++) {
    const slot = box.querySelector(".pct-slot[data-role='" + roles[i] + "']");
    if (!slot) continue;
    // 前导零: 按"有效位数"判断该位要不要占宽度。
    // 注意不能写成 digits.slice(0,i).every(c => c==='0') —— i=0 时 slice 出来是空数组,
    // every 恒为 true, 会把百位永远藏掉(33 显示成 3、100 显示成 00)。
    slot.classList.toggle('dim', i < 3 - String(v).length);
    const strip = slot.firstChild;
    const y = -Number(digits[i]) * 1.2; // 每格 1.2em, 与 CSS 里 .pct-strip i 的高度一致
    if (instant) {
      strip.style.transition = 'none';
      strip.style.transform = 'translateY(' + y + 'em)';
      void strip.offsetWidth; // 强制重排后再放开过渡
      strip.style.transition = '';
    } else {
      strip.style.transform = 'translateY(' + y + 'em)';
    }
  }
  box.setAttribute('aria-label', v + '%');
}

// 推进: 当前行"真做完了 && 停够最短时间(第 3 行还要等百分比动画追平)"才转绿, 下一行转黄
function bootTick() {
  if (!bootActive) return;
  const i = bootPointer;
  if (i < 0 || i > 3) return;
  if (!bootMarks[i]) return;
  if (Date.now() - bootStepAt < BOOT_MIN_STEP_MS) return;
  if (i === 2 && bootPctTarget !== null && bootPctShown < bootPctTarget) return; // 等数字跳到真实值
  bootSetStep(i, 'ok');       // 完成: 变绿 + 文字纵向滚跳一次
  bootPointer = i + 1;
  bootStepAt = Date.now();
  if (bootPointer > 3) { bootDone(); return; }
  bootSetStep(bootPointer, 'on');
  if (bootPointer === 2) bootPctStart();
  if (bootPointer === 3) bootReadyStart();
}

// 换状态: 加减类(颜色由 CSS 过渡) + 文字纵向滚跳一次 + 光环按状态收放
function bootSetStep(i, cls) {
  const li = $('#' + BOOT_STEPS[i]);
  if (!li) return;
  li.classList.remove('on', 'ok');
  li.classList.add(cls);
  const label = li.querySelector('.boot-label .roll-in');
  if (label) rollSwap(label, label.textContent, true);
  bootHalo(i, cls === 'on' ? 'breath' : cls === 'ok' ? 'settle' : 'off');
}

// 光环:
//   breath(当前步) —— 开始呼吸循环(1 → 2.1 → 1)
//   settle(已完成) —— 停掉循环, 从"此刻的姿态"平滑缩到最小并停住; 此刻已经最小就什么都不做
//   off(还没轮到) —— 停掉并复位
// 用 WAAPI 而不是 CSS 关键帧: 关键帧没法从当前帧平滑收到一个静止值(摘掉动画会瞬间弹回),
// getComputedStyle 能在动画进行中读到当前矩阵, 于是"缩小后保持最小"才是连续的。
function bootHalo(i, mode) {
  const halo = $('#' + BOOT_STEPS[i] + ' .boot-halo');
  if (!halo) return;
  let st = bootHalos.get(i);
  if (!st) { st = { anim: null }; bootHalos.set(i, st); }
  if (mode === 'breath') {
    if (!st.anim) {
      st.anim = halo.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(2.1)' }, { transform: 'scale(1)' }],
        { duration: 1700, iterations: Infinity, easing: 'cubic-bezier(.4,0,.6,1)' }
      );
    }
    return;
  }
  if (!st.anim) { halo.style.transform = 'scale(1)'; return; }
  const cur = window.getComputedStyle(halo).transform; // 动画进行中的实际姿态(矩阵)
  st.anim.cancel();
  st.anim = null;
  const scale = (/^matrix\(([-\d.]+)/.exec(cur || '') || [])[1];
  if (mode === 'settle' && scale !== undefined && Number(scale) > 1.02) {
    // 从此刻的姿态平滑缩到最小并停住
    halo.animate([{ transform: cur }, { transform: 'scale(1)' }],
      { duration: 260, easing: 'cubic-bezier(.22,.8,.3,1)', fill: 'forwards' });
  } else {
    // 已经是最小(或还没轮到): 直接落定, 不做任何放大
    halo.style.transform = 'scale(1)';
  }
}

function bootHalosReset() {
  for (const [, st] of bootHalos) { try { if (st.anim) st.anim.cancel(); } catch (e) { /* ignore */ } }
  bootHalos.clear();
  for (const id of BOOT_STEPS) {
    const halo = $('#' + id + ' .boot-halo');
    if (halo) halo.style.transform = '';
    const getAnim = halo && halo.getAnimations ? halo.getAnimations() : [];
    for (const a of getAnim) { try { a.cancel(); } catch (e) { /* ignore */ } }
  }
}

// 走到第 3 行才显示数字: 已有真实值就直接落上去(计数可能早就追完了), 否则等事件来了再出现
function bootPctStart() {
  bootPctBuild();                 // 走到这一行才建数字条(之前整块是空的, 不提前显示 %)
  bootPctRenderedAt = performance.now();
  bootPctRender(bootPctTarget === null ? 0 : bootPctShown, true);
}

// 同理: 头像计数可能在本行轮到之前就算完了, 到这一行才把它显示出来
function bootReadyStart() {
  if (bootReadyText) $('#bootStep3 .boot-val').textContent = bootReadyText;
}

async function bootDone() {
  if (!bootActive) return;
  const tok = bootToken;
  rollSwap($('#bootTitle'), '初始化完成');
  $('#bootTitleWrap').classList.add('done'); // 大字转绿
  await bootSleep(BOOT_HOLD_DONE_MS);
  if (tok !== bootToken || !bootActive) return;
  // 淡出的同时重放整页入场动画(概览条/页签/卡片/好友行), 就是刷新页面那套观感
  replayPageEntrance();
  bootHide();
}

// 快照已完成: 等主界面数据 + 首屏可见头像, 先到先走, 最多 BOOT_READY_MS;
// 但这一步本身至少停 BOOT_READY_MIN_MS, 否则快的时候一眨眼就过去了
async function bootWaitReady(dataPromise) {
  if (!bootActive) return;
  const tok = bootToken;
  const startedAt = Date.now();
  const deadline = startedAt + BOOT_READY_MS;
  try { await dataPromise; } catch (e) { /* 接口失败也照走, 到点即放行 */ }
  if (tok !== bootToken || !bootActive) return;
  // 头像逐个落定: 把"在等什么"显示出来, 否则这一步看不出在等。
  // 注意只在本行已经轮到(黄字)时才写进界面 —— 提前写就会出现"上一行还在跑, 下一行已经有数"。
  await waitImages(firstScreenAvatars(), Math.max(0, deadline - Date.now()), (done, total) => {
    if (tok !== bootToken) return;
    bootReadyText = '头像 ' + done + '/' + total;
    if (bootPointer >= 3) $('#bootStep3 .boot-val').textContent = bootReadyText;
  });
  if (tok !== bootToken || !bootActive) return;
  const rest = BOOT_READY_MIN_MS - (Date.now() - startedAt);
  if (rest > 0) await bootSleep(rest);
  if (tok !== bootToken || !bootActive) return;
  bootMark(3);
}

// 首屏可见的头像: 折叠分组里的 <img loading=lazy> 浏览器根本不会请求, 不能算进来
function firstScreenAvatars() {
  const vh = window.innerHeight || 800;
  const out = [];
  for (const img of document.querySelectorAll('#friendsList img.avatar')) {
    if (img.closest('.group-body.collapsed')) continue;
    const r = img.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.top > vh + 120) break; // DOM 顺序即从上到下
    if (r.bottom > -120) out.push(img);
  }
  return out;
}

function waitImages(imgs, ms, onTick) {
  return new Promise((resolve) => {
    if (!imgs.length || ms <= 0) { resolve(); return; }
    const total = imgs.length;
    let settledCount = 0;
    let finished = false;
    const timer = setTimeout(() => { finished = true; resolve(); }, ms); // 超时兜底: 慢图不等了
    const one = () => {
      settledCount++;
      if (onTick) onTick(settledCount, total);
      if (settledCount >= total && !finished) { finished = true; clearTimeout(timer); resolve(); }
    };
    for (const img of imgs) {
      if (img.complete) { one(); continue; } // 已在缓存里: 立即算落定, 也要计数
      img.addEventListener('load', one, { once: true });
      img.addEventListener('error', one, { once: true });
    }
  });
}

// 淡出时重放整页入场: 概览条/页签/卡片靠重启 CSS 动画, 好友行靠重新编号 .enter
function replayPageEntrance() {
  const targets = [];
  for (const sel of ['#mainView .overview-item', '#mainView .tabs', '#mainView .card', '.site-mark']) {
    targets.push(...document.querySelectorAll(sel));
  }
  for (const el of targets) el.style.animation = 'none';
  const list = $('#friendsList');
  list.querySelectorAll('.enter').forEach((el) => el.classList.remove('enter'));
  void document.body.offsetWidth; // 一次强制重排, 让上面的清零生效(动画才会从头播)
  for (const el of targets) el.style.animation = '';
  markFriendsEntrance();
}

// SSE 进度事件 → 展板。只认语义阶段, 不绑具体 HTTP 请求(两条登录路的请求序列不一样)
function bootProgress(d) {
  if (!d || !d.stage) return;
  if (d.stage === 'verified') {
    if (loginWaiting) bootShow(); // 淡入时机: 凭据已验证+拿到用户信息, 不是点提交时
    return;
  }
  if (!bootActive) return; // 主界面上的 auth(WS 重连)之类一律忽略
  if (d.stage === 'auth') bootMark(0);
  else if (d.stage === 'roster') bootMark(1);
  else if (d.stage === 'friends') bootPercent(d.fetched, d.total);
}

