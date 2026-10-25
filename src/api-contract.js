'use strict';
const { FRIEND_CONFIG, SETTINGS } = require('../public/contracts');

class ValidationError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

function booleanValue(value, key) {
  if (value === true || value === 1) return 1;
  if (value === false || value === 0) return 0;
  throw new ValidationError(`${key} 必须是布尔值或 0/1`);
}

// Canonical snake_case keys plus legacy camelCase aliases. Validate the whole
// patch before writing anything; ambiguous aliases and unknown fields are errors.
function parsePatch(body, definitions) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('请求体必须是对象');
  const known = new Set(definitions.flatMap(([key, alias]) => [key, alias]));
  for (const key of Object.keys(body)) if (!known.has(key)) throw new ValidationError(`未知字段: ${key}`);
  const out = {};
  for (const [key, alias, type] of definitions) {
    const parse = (value) => {
      if (type === 'boolean') return booleanValue(value, key);
      if (value === null) return null;
      if (type === 'limit') {
        if (Number.isSafeInteger(value) && value > 0) return value;
        throw new ValidationError(`${key} 必须是正整数或 null`);
      }
      if (typeof value === 'string') return value || null;
      throw new ValidationError(`${key} 必须是字符串或 null`);
    };
    if (!Object.hasOwn(body, key) && !Object.hasOwn(body, alias)) continue;
    const value = parse(Object.hasOwn(body, key) ? body[key] : body[alias]);
    if (key !== alias && Object.hasOwn(body, key) && Object.hasOwn(body, alias) && !Object.is(value, parse(body[alias]))) {
      throw new ValidationError(`${key} 与 ${alias} 冲突`);
    }
    out[key] = value;
  }
  return out;
}

const parseFriendConfig = (body) => parsePatch(body, FRIEND_CONFIG.map(([key, alias]) => [key, alias, 'boolean']));
const parseSettings = (body) => parsePatch(body, SETTINGS);

function configOf(friend) {
  if (!friend) return null;
  return { friend_vrchat_id: friend.friend_vrchat_id,
    ...Object.fromEntries(FRIEND_CONFIG.map(([key]) => [key, friend[key] === 1 ? 1 : 0])) };
}

module.exports = { ValidationError, parseFriendConfig, parseSettings, configOf };
