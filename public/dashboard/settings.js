'use strict';
// Dashboard settings controller. Dependencies are explicit; local UI state stays private.
window.VrcDashboardSettings = {
  create(context) {
    const { $, api, state, closeBellPopover, initLogPanel, toast, loadFeed } = context;
    // ---------- 设置页 ----------
    function syncTrimFields() {
      $('#trimFields').classList.toggle('hidden', !$('#sAutoTrim').checked);
    }
    function syncQqFields() {
      const on = $('#sQqEnabled').checked;
      $('#qqFields').classList.toggle('hidden', !on);
      const disabledHint = $('#qqDisabledHint');
      if (disabledHint) disabledHint.classList.toggle('hidden', on);
    }
    let settingsMsgTimer = null;
    function flashSettings(text) {
      $('#settingsMsg').textContent = text;
      clearTimeout(settingsMsgTimer);
      settingsMsgTimer = setTimeout(() => { $('#settingsMsg').textContent = ''; }, 2000);
    }
    async function loadSettings() {
      const r = await api('GET', '/api/settings');
      const s = (r.data && r.data.settings) || {};
      $('#sQqEnabled').checked = !!s.qq_enabled;
      $('#sQqAppId').value = s.qq_app_id || '';
      $('#sQqAppSecret').value = '';
      $('#sQqAppSecret').placeholder = s.qq_app_secret ? '已配置(留空保持不变)' : '未配置';
      $('#sNotifyGroupAnnouncement').checked = s.notify_group_announcement !== 0;
      $('#sNotifyBoop').checked = s.notify_boop !== 0;
      $('#sNotifyInvite').checked = s.notify_invite !== 0;
      const trimLimit = Number(s.friend_event_limit) || 0;
      $('#sAutoTrim').checked = trimLimit > 0;
      $('#sFriendEventLimit').value = trimLimit > 0 ? trimLimit : '';
      syncTrimFields();
      syncQqFields();
      state.settingsLoaded = true;
    }
    function openSettings() {
      state.settingsOpen = true;
      const el = $('#settingsView');
      el.classList.remove('hidden', 'closing');
      closeBellPopover(true);
      if (!state.settingsLoaded) loadSettings();
      initLogPanel();
    }
    function closeSettings() {
      const el = $('#settingsView');
      if (!state.settingsOpen) return;
      state.settingsOpen = false;
      el.classList.add('closing');
      setTimeout(() => { el.classList.add('hidden'); el.classList.remove('closing'); }, 170);
    }


    function bindSettings() {
      // QQ 机器人: 「快速创建 QQBot」是按钮(不是链接), 点击新页面打开 QQ 开放平台
      $('#createQqBot').addEventListener('click', () => {
        window.open('https://q.qq.com/qqbot/openclaw/login.html', '_blank', 'noopener');
      });
      // 设置页
      $('#sQqEnabled').addEventListener('change', async () => {
        const input = $('#sQqEnabled');
        const want = input.checked ? 1 : 0;
        try {
          const r = await api('PUT', '/api/settings', { qq_enabled: want });
          if (!r.data.ok) { input.checked = !input.checked; flashSettings(r.data.error || '保存失败'); return; }
          syncQqFields();
        } catch (e) { input.checked = !input.checked; flashSettings(e.message); }
      });
      $('#saveSettings').addEventListener('click', async () => {
        const body = { qq_app_id: $('#sQqAppId').value.trim() || null };
        const secret = $('#sQqAppSecret').value;
        if (secret) body.qq_app_secret = secret;
        try {
          const r = await api('PUT', '/api/settings', body);
          flashSettings(r.data.ok ? '已保存' : (r.data.error || '保存失败'));
          if (r.data.ok) { $('#sQqAppSecret').value = ''; loadSettings(); }
        } catch (e) { flashSettings(e.message); }
      });
      $('#testQq').addEventListener('click', async () => {
        try {
          const r = await api('POST', '/api/test/qq', {});
          const ok = r.status < 400 && (!r.data || r.data.ok !== false);
          if (ok) flashSettings('已发送测试推送');
          else flashSettings('测试推送失败: ' + ((r.data && r.data.error) || ('HTTP ' + r.status)));
        } catch (e) { flashSettings(e.message || '测试推送失败'); }
      });
      for (const [id, key] of [['#sNotifyGroupAnnouncement', 'notify_group_announcement'], ['#sNotifyBoop', 'notify_boop'], ['#sNotifyInvite', 'notify_invite']]) {
        $(id).addEventListener('change', async () => {
          const input = $(id);
          const want = input.checked ? 1 : 0;
          try {
            const r = await api('PUT', '/api/settings', { [key]: want });
            if (!r.data.ok) { input.checked = !input.checked; flashSettings(r.data.error || '保存失败'); }
          } catch (e) { input.checked = !input.checked; flashSettings(e.message); }
        });
      }
      $('#sAutoTrim').addEventListener('change', async () => {
        const on = $('#sAutoTrim').checked;
        const n = $('#sFriendEventLimit').valueAsNumber;
        const limit = on ? (Number.isSafeInteger(n) && n > 0 ? n : 50000) : 0;
        try {
          const r = await api('PUT', '/api/settings', { friend_event_limit: on ? limit : null });
          if (!r.data.ok) { $('#sAutoTrim').checked = !on; flashSettings(r.data.error || '保存失败'); return; }
          if (on) $('#sFriendEventLimit').value = limit;
          syncTrimFields();
        } catch (e) { $('#sAutoTrim').checked = !on; flashSettings(e.message); }
      });
      $('#saveLimit').addEventListener('click', async () => {
        const n = $('#sFriendEventLimit').valueAsNumber;
        try {
          const r = await api('PUT', '/api/settings', { friend_event_limit: Number.isSafeInteger(n) && n > 0 ? n : 50000 });
          if (r.data.ok) { $('#sFriendEventLimit').value = Number.isSafeInteger(n) && n > 0 ? n : 50000; flashSettings('已保存'); }
          else flashSettings(r.data.error || '保存失败');
        } catch (e) { flashSettings(e.message); }
      });
      $('#clearLogs').addEventListener('click', async () => {
        if (!window.confirm('确定清空全部好友日志？此操作不可恢复')) return;
        try {
          const r = await api('DELETE', '/api/friend-events');
          toast(r.data.ok ? '已清空 ' + r.data.removed + ' 条' : '清空失败');
          loadFeed(false);
        } catch (e) { toast(e.message); }
      });
    }

    return { bindSettings, openSettings, closeSettings };
  }
};
