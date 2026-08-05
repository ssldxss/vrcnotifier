'use strict';
// VRChat location 字符串解析。
// 结构: worldId:instanceId~param(value)~param2
// 哨兵: "" / "offline" / "traveling" / "private" 不是真实实例。

function parseLocation(tag) {
  const s = String(tag ?? '');
  const ctx = {
    worldId: null,
    instanceId: null,
    flags: {},
    isReal: false,
    kind: 'unknown'
  };
  if (s === '') { ctx.kind = 'none'; return ctx; }
  if (s === 'offline') { ctx.kind = 'offline'; return ctx; }
  if (s === 'traveling') { ctx.kind = 'traveling'; return ctx; }
  if (s === 'private') { ctx.kind = 'private'; return ctx; }

  const sep = s.indexOf(':');
  const worldPart = sep === -1 ? s : s.slice(0, sep);
  const rest = sep === -1 ? '' : s.slice(sep + 1);
  if (!worldPart.startsWith('wrld_')) { ctx.kind = 'invalid'; return ctx; }

  ctx.worldId = worldPart;
  ctx.instanceId = rest;
  ctx.isReal = true;
  ctx.kind = 'instance';

  for (const part of rest.split('~')) {
    if (!part) continue;
    const a = part.indexOf('(');
    if (a === -1) {
      // 无值标志, 如 canRequestInvite / ageGate
      ctx.flags[part] = true;
      continue;
    }
    const key = part.slice(0, a);
    const value = part.slice(a + 1, part.lastIndexOf(')'));
    ctx.flags[key] = value === '' ? true : value;
  }
  return ctx;
}

function isRealLocation(tag) {
  return parseLocation(tag).isReal;
}

module.exports = { parseLocation, isRealLocation };
