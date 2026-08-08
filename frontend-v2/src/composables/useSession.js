import { ref } from 'vue';
import { useApi } from './useApi.js';

/** 视图状态: 'gate' | 'login' | 'twofa' | 'main' */
const view = ref('gate');
const currentUser = ref(null);
const tempSessionId = ref(null);
const twofaKind = ref('emailOtp');
const loginError = ref('');
const loginLoading = ref(false);

export function useSession() {
  const { client, setToken, accessToken } = useApi();

  /** 初始化：检查是否已配置 token，已登录则自动恢复 */
  async function init() {
    if (!accessToken()) {
      view.value = 'gate';
      return;
    }
    try {
      const cfg = await client.getConfig();
      if (cfg.tokenRequired && !accessToken()) {
        view.value = 'gate';
        return;
      }
    } catch (e) {
      view.value = 'gate';
      return;
    }
    await checkSession();
  }

  /** 检查当前会话 */
  async function checkSession() {
    try {
      const r = await client.getSession();
      if (r.loggedIn && r.user) {
        currentUser.value = r.user;
        view.value = 'main';
      } else {
        currentUser.value = null;
        view.value = 'login';
      }
    } catch (e) {
      if (e.status === 401) {
        view.value = 'gate';
      } else {
        currentUser.value = null;
        view.value = 'login';
      }
    }
  }

  /** 连接：保存后端地址和令牌 */
  function connect(baseUrl, token) {
    const { setBaseUrl, setToken: setApiToken } = useApi();
    setBaseUrl(baseUrl);
    setApiToken(token);
  }

  /** 登录 */
  async function login(username, password, rememberMe) {
    loginLoading.value = true;
    loginError.value = '';
    try {
      const r = await client.login(username, password, rememberMe);
      if (r.requiresTwoFactorAuth) {
        tempSessionId.value = r.tempSessionId;
        twofaKind.value = (r.requiresTwoFactorAuth[0] || 'emailOtp');
        view.value = 'twofa';
        return;
      }
      if (r.ok) {
        currentUser.value = r.user;
        view.value = 'main';
      } else {
        loginError.value = r.error || '登录失败';
      }
    } catch (e) {
      loginError.value = e.message || '登录失败';
    } finally {
      loginLoading.value = false;
    }
  }

  /** 2FA 验证 */
  async function verify2fa(code) {
    loginLoading.value = true;
    loginError.value = '';
    try {
      const r = await client.login2fa(tempSessionId.value, code, twofaKind.value);
      if (r.ok) {
        currentUser.value = r.user;
        view.value = 'main';
        tempSessionId.value = null;
      } else {
        loginError.value = r.error || '验证失败';
      }
    } catch (e) {
      loginError.value = e.message || '验证失败';
    } finally {
      loginLoading.value = false;
    }
  }

  /** 取消 2FA */
  function cancel2fa() {
    tempSessionId.value = null;
    view.value = 'login';
    loginError.value = '';
  }

  /** 登出 */
  async function logout() {
    try {
      await client.logout();
    } catch (e) {
      /* ignore */
    }
    currentUser.value = null;
    view.value = 'login';
  }

  return {
    view, currentUser, tempSessionId, twofaKind,
    loginError, loginLoading,
    init, checkSession, connect, login, verify2fa, cancel2fa, logout
  };
}