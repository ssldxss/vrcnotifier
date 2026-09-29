'use strict';
// 设置页: QQ 机器人字段显隐/保存、通知开关即时保存、测试推送按钮。
// 从 app.js 拆出; 本文件仍是传统脚本、函数保持全局。

// ---------- 设置 ----------
// QQ 开关: 实时保存(成功不提示, 后端 [server] 更新通知设置 日志可在面板看到); 关闭时隐藏 AppID/AppSecret/说明/按钮
function syncQqFields() {
  const on = $('#sQqEnabled').checked;
  $('#qqFields').classList.toggle('hidden', !on);
  $('#qqDisabledHint').classList.toggle('hidden', on);
}

// 卡片提示: 2s 后自动消失(重复触发重置计时)
let settingsMsgTimer = null;
function flashSettingsMsg(text) {
  $('#settingsMsg').textContent = text;
  clearTimeout(settingsMsgTimer);
  settingsMsgTimer = setTimeout(() => { $('#settingsMsg').textContent = ''; }, 2000);
}

$('#sQqEnabled').addEventListener('change', async () => {
  const input = $('#sQqEnabled');
  const want = input.checked ? 1 : 0;
  try {
    const r = await api('PUT', '/api/settings', { qq_enabled: want });
    if (!r.data.ok) {
      input.checked = want !== 1; // 回滚本次提交的开关值
      flashSettingsMsg(r.data.error || '保存失败');
      return;
    }
  } catch (e) {
    input.checked = want !== 1;
    flashSettingsMsg(e.message || '保存失败');
    return;
  }
  syncQqFields();
});

async function loadSettings() {
  const r = await api('GET', '/api/settings');
  const s = r.data.settings || {};
  $('#sQqEnabled').checked = !!s.qq_enabled;
  $('#sQqAppId').value = s.qq_app_id || '';
  $('#sQqAppSecret').placeholder = s.qq_app_secret ? '已配置(留空保持不变)' : '未配置';
  // 站内通知类型开关: 缺省视为开(后端仅显式 0 关闭)
  $('#sNotifyGroupAnnouncement').checked = s.notify_group_announcement !== 0;
  $('#sNotifyBoop').checked = s.notify_boop !== 0;
  $('#sNotifyInvite').checked = s.notify_invite !== 0;
  syncQqFields();
}

// 保存按钮: 仅提交 AppID/AppSecret(开关已实时保存); 结果提示 2s 后消失
$('#saveSettings').addEventListener('click', async () => {
  const body = { qq_app_id: $('#sQqAppId').value.trim() || null };
  const qqSecret = $('#sQqAppSecret').value;
  if (qqSecret) body.qq_app_secret = qqSecret;
  const r = await api('PUT', '/api/settings', body);
  flashSettingsMsg(r.data.ok ? '已保存' : (r.data.error || '保存失败'));
  if (r.data.ok) {
    $('#sQqAppSecret').value = '';
    loadSettings();
  }
});

// 通知设置: 切换即时保存(无保存按钮); 成功不提示(后端 [server] 更新通知设置 日志可在面板看到), 失败时回滚开关 UI 并提示
function bindNotifyToggle(id, key) {
  $(id).addEventListener('change', async () => {
    const input = $(id);
    const want = input.checked ? 1 : 0;
    const r = await api('PUT', '/api/settings', { [key]: want });
    if (!r.data.ok) {
      input.checked = want !== 1; // 回滚本次提交的开关值
      $('#notifyMsg').textContent = r.data.error || '保存失败';
    }
  });
}
bindNotifyToggle('#sNotifyGroupAnnouncement', 'notify_group_announcement');
bindNotifyToggle('#sNotifyBoop', 'notify_boop');
bindNotifyToggle('#sNotifyInvite', 'notify_invite');

function bindTest(kind, btnId) {
  $(btnId).addEventListener('click', async () => {
    // 发送结果统一由后端日志流推送([server] 发送测试通知/成功/失败), 刷新后依然可见
    await api('POST', '/api/test/' + kind, {});
  });
}
bindTest('qq', '#testQq');

// 概览条 / VRChat 状态 / WebSocket 曲线 已拆到 overview.js + statusmodel.js, 见 index.html 的脚本顺序

// SSE 连接(登录页与主界面共用): 日志/状态/健康/登录进度全部实时推送, 前端不再轮询
