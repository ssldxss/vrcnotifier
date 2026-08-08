import { ref } from 'vue';

const LS_BASE = 'vrcn_base';
const LS_TOKEN = 'vrcn_token';

function baseUrl() {
  return (localStorage.getItem(LS_BASE) || 'http://127.0.0.1:3000').replace(/\/+$/, '');
}

function accessToken() {
  return localStorage.getItem(LS_TOKEN) || '';
}

let _client = null;

function getClient() {
  if (!_client) {
    _client = new window.VrcNotifier.Client({
      baseUrl: baseUrl(),
      token: accessToken()
    });
  }
  return _client;
}

export function useApi() {
  const client = getClient();

  /** 更新后端地址并重新创建客户端 */
  function setBaseUrl(url) {
    const clean = String(url || 'http://127.0.0.1:3000').replace(/\/+$/, '');
    localStorage.setItem(LS_BASE, clean);
    _client = new window.VrcNotifier.Client({
      baseUrl: clean,
      token: accessToken()
    });
  }

  /** 更新访问令牌 */
  function setToken(token) {
    localStorage.setItem(LS_TOKEN, token || '');
    _client = new window.VrcNotifier.Client({
      baseUrl: baseUrl(),
      token: token || ''
    });
  }

  /** 获取头像 URL */
  function avatarUrl(key) {
    if (!key) return '';
    return baseUrl() + '/api/avatar/' + encodeURIComponent(key) + '?token=' + encodeURIComponent(accessToken());
  }

  return { client, setBaseUrl, setToken, avatarUrl, baseUrl, accessToken };
}