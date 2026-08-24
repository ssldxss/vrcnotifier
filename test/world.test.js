'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createWorldFetcher } = require('../src/world');

test('world fetcher requests without Cookie/Authorization headers', async () => {
  let captured = null;
  const fetchImpl = async (url, opts) => {
    captured = { url, headers: opts.headers };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'wrld_x', name: '测试世界' })
    };
  };
  const worldFetcher = createWorldFetcher({ fetchImpl, baseUrl: 'https://api.vrchat.cloud/api/1/' });
  const data = await worldFetcher.world('wrld_x');
  assert.equal(data.name, '测试世界');
  assert.equal(captured.url, 'https://api.vrchat.cloud/api/1/worlds/wrld_x');
  assert.equal(captured.headers.Cookie, undefined);
  assert.equal(captured.headers.Authorization, undefined);
  assert.equal(captured.headers['User-Agent'], 'vrcnotifier/1.0');
});

test('world fetcher throws on non-ok response', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 404,
    text: async () => JSON.stringify({ error: { message: 'world not found' } })
  });
  const worldFetcher = createWorldFetcher({ fetchImpl });
  await assert.rejects(() => worldFetcher.world('wrld_missing'), /world not found/);
});
