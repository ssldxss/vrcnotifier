
'use strict';
// 公共底座($ / $ / LS_* / escapeHtml / escapeAttr)已拆到 base.js, 必须最先加载

// 各功能块已按文件拆分, 本文件只负责"装配与启动"(见 index.html 的脚本顺序):
//   base.js 公共底座 · state.js 共享状态 · net.js 后端往来 · auth.js 视图与登录
//   boot.js/bootmath.js 等待页 · friends.js/friendmodel.js 好友列表 · logpanel.js/logparse.js 日志
//   overview.js/statusmodel.js 概览与曲线 · settings.js 设置 · ui.js/thememodel.js/scrollmath.js 外壳

// 页面切换/主题/下拉/丝滑滚动 已拆到 ui.js + thememodel.js + scrollmath.js, 见 index.html 的脚本顺序
// 启动时同步恢复上次视图(首帧前完成, 避免刷新瞬间闪出「连接后端」门禁页);
// 会话验证仍在后台进行, 无效时再由 checkSession 切到登录/门禁页。
try {
  const savedView = sessionStorage.getItem('vrcn_lastView');
  if (savedView === 'main' || savedView === 'login') showView(savedView);
} catch (e) {}
// 恢复上次所在页面(好友监控/设置), 首帧前完成
try {
  const savedTab = sessionStorage.getItem('vrcn_lastTab');
  if (savedTab === 'tab-friends' || savedTab === 'tab-settings') switchTab(savedTab);
} catch (e) {}
// 自动探测后端(同源优先 → 本机默认), 完成后拉配置; 探测结果用于未手动配置时的默认地址
(async () => {
  await discoverBase();
  loadConfig();
})();
startConnWatch();
fillGateForm(); // 先用默认地址预填门禁卡; discoverBase 完成后会再次刷新

