'use strict';
// 好友动态(日志)纯逻辑: 类型 code/展示文案/分类/筛选、单行摘要与「旧→新」变化行。
// 后端 type 字段是中文展示标签、type_code 是稳定英文 code; 旧数据没有 type_code 时用标签反查。
// 浏览器用 <script src="eventmodel.js"> 引入(挂 window.VrcEventModel); Node 用 require 引入(单测)。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./instance'));
  } else {
    root.VrcEventModel = factory(root.VrcInstance);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (VrcInstance) {
  const LABEL_TO_CODE = {
    上线: 'friend_online',
    下线: 'friend_offline',
    网页上线: 'friend_web_online',
    网页下线: 'friend_web_offline',
    状态变化: 'status_change',
    自定义状态: 'status_description_change',
    切换世界: 'location_change',
    位置变动: 'location_change',
    群组公告: 'group_announcement',
    戳一戳: 'boop',
    世界邀请: 'invite',
    请求邀请: 'request_invite',
    改名: 'name_change',
    信任等级变化: 'trust_level_change',
    新增好友: 'friend_added',
    好友移除: 'friend_removed'
  };

  // 界面展示用词(与后端中文标签解耦, 例如 location_change 显示「位置变动」)
  const CODE_LABELS = {
    friend_online: '上线',
    friend_offline: '下线',
    friend_web_online: '网页上线',
    friend_web_offline: '网页下线',
    status_change: '状态变化',
    status_description_change: '自定义状态',
    location_change: '位置变动',
    group_announcement: '群组公告',
    boop: '戳一戳',
    invite: '世界邀请',
    request_invite: '请求邀请',
    name_change: '改名',
    trust_level_change: '信任等级变化',
    friend_added: '新增好友',
    friend_removed: '好友移除'
  };

  function typeCode(row) {
    const code = row && (row.type_code || LABEL_TO_CODE[row.type]);
    return code || '';
  }

  function typeLabel(code) {
    return CODE_LABELS[code] || code;
  }

  const PRESENCE_CODES = ['friend_online', 'friend_offline', 'friend_web_online', 'friend_web_offline'];
  const STATUS_CODES = ['status_change', 'status_description_change'];
  const NOTIFICATION_CODES = ['group_announcement', 'boop', 'invite', 'request_invite'];

  function eventKind(code) {
    if (PRESENCE_CODES.includes(code)) return 'presence';
    if (STATUS_CODES.includes(code)) return 'status';
    if (code === 'location_change') return 'location';
    if (NOTIFICATION_CODES.includes(code)) return 'notification';
    return 'other';
  }

  // 顶部筛选 chip -> 请求 /api/friend-events 的 types; all 表示不过滤。
  // 上下线拆成 4 种独立类型, 支持多选并集。
  const CHIP_CODES = {
    all: null,
    location: ['location_change'],
    online: ['friend_online'],
    web_online: ['friend_web_online'],
    offline: ['friend_offline'],
    web_offline: ['friend_web_offline'],
    presence: PRESENCE_CODES,
    status: STATUS_CODES,
    notification: NOTIFICATION_CODES
  };

  // 手动把所有类型 chip 都选满时归一化为空选择(= 全部), 避免出现"全选"这种无意义状态
  const TYPE_KEYS = ['location', 'online', 'web_online', 'offline', 'web_offline', 'status', 'notification'];

  function normalizeFilters(selected) {
    const list = Array.isArray(selected) ? selected.slice() : [];
    return TYPE_KEYS.every((key) => list.includes(key)) ? [] : list;
  }

  // 实时事件是否命中当前筛选(与服务端 query 条件同口径); 用于 SSE 增量插入前判断
  // 与服务端 friend-events 搜索列对齐: display_name/friend_id/world_name/位置(含世界 ID 与实例)/
  // group_name/group_id/title/body; 服务端不搜旧世界名, 这里也不能搜, 否则「实时匹配、刷新消失」。
  function eventMatchesFilters(row, opts) {
    const o = opts || {};
    if (!row) return false;
    if (o.codes && !o.codes.includes(typeCode(row))) return false;
    if (o.favoriteIds && !o.favoriteIds.has(row.friend_vrchat_id)) return false;
    if (o.friendId && row.friend_vrchat_id !== o.friendId) return false;
    if (o.search) {
      const q = String(o.search).toLowerCase();
      const hay = [row.friend_name, row.friend_vrchat_id, row.world_name, row.world_id,
        row.instance_id, row.location, row.group_name, row.group_id, row.title, row.body]
        .filter(Boolean).join('\n').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function filterCodes(chip) {
    if (Array.isArray(chip)) {
      const out = [];
      for (const key of chip) {
        for (const code of CHIP_CODES[key] || []) {
          if (!out.includes(code)) out.push(code);
        }
      }
      return out.length ? out : null;
    }
    const codes = CHIP_CODES[chip];
    return codes ? codes.slice() : null;
  }

  const STATUS_DOTS = {
    active: 'online',
    'join me': 'joinme',
    'ask me': 'askme',
    busy: 'busy'
  };

  function statusDotClass(status) {
    return STATUS_DOTS[status] || 'offline';
  }

  function presenceDotClass(state) {
    if (state === 'online') return 'online';
    if (state === 'active') return 'web';
    return 'offline';
  }

  function locationOf(row, prefix) {
    const p = prefix || '';
    return VrcInstance.formatLocation({
      worldId: row[p + 'world_id'],
      worldName: row[p + 'world_name'],
      instanceId: row[p + 'instance_id']
    });
  }

  const STATE_LABELS = { online: '在线', active: '网页在线', offline: '离线' };
  function statePart(state) {
    return { dot: presenceDotClass(state), label: STATE_LABELS[state] || '未知' };
  }

  // 展开后的「旧 → 新」变化(只一行用)
  function changeOf(row) {
    const code = typeCode(row);
    const kind = eventKind(code);
    if (kind === 'location') {
      return { kind: 'location', old: locationOf(row, 'old_'), new: locationOf(row, '') };
    }
    if (kind === 'status' && code === 'status_change') {
      return {
        kind: 'status',
        dots: { old: statusDotClass(row.old_status), new: statusDotClass(row.new_status) }
      };
    }
    if (kind === 'status') {
      return { kind: 'description', old: row.old_desc ?? null, new: row.new_desc ?? null };
    }
    if (kind === 'presence') {
      return { kind: 'presence', old: statePart(row.old_state), new: statePart(row.new_state) };
    }
    if (kind === 'notification') {
      return { kind: 'notification', title: row.title ?? null, body: row.body ?? null };
    }
    return { kind, old: null, new: null };
  }

  // 行内摘要(最后一列, 一行)
  function summaryOf(row) {
    const code = typeCode(row);
    const kind = eventKind(code);
    if (kind === 'location') return { kind: 'location', location: locationOf(row, '') };
    if (kind === 'presence') {
      if (code === 'friend_online' || code === 'friend_offline') {
        const loc = locationOf(row, code === 'friend_online' ? '' : 'old_');
        if (loc.worldName) return { kind: 'presence', location: loc };
        return { kind: 'presence', text: code === 'friend_online' ? '在线' : '离线' };
      }
      return { kind: 'presence', text: code === 'friend_web_online' ? '仅网页在线' : '退出网页' };
    }
    if (kind === 'status') {
      if (code === 'status_change') {
        return {
          kind: 'status',
          dots: { old: statusDotClass(row.old_status), new: statusDotClass(row.new_status) }
        };
      }
      return { kind: 'description', text: row.new_desc ?? '' };
    }
    if (kind === 'notification') return { kind: 'notification', text: row.body || row.title || '' };
    return { kind: 'other', text: '' };
  }

  return {
    typeCode,
    typeLabel,
    eventKind,
    filterCodes,
    normalizeFilters,
    eventMatchesFilters,
    statusDotClass,
    presenceDotClass,
    changeOf,
    summaryOf
  };
});
