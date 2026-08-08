<template>
  <div class="glass-card login-card" style="width: 380px;">
    <h2 style="margin-bottom: 20px; font-size: 18px; text-align: center;">登录 VRChat</h2>

    <div style="margin-bottom: 12px;">
      <input
        v-model="username"
        type="text"
        placeholder="用户名"
        autocomplete="username"
        @keyup.enter="doLogin"
      />
    </div>

    <div style="margin-bottom: 12px;">
      <input
        v-model="password"
        type="password"
        placeholder="密码"
        autocomplete="current-password"
        @keyup.enter="doLogin"
      />
    </div>

    <label class="remember-row" style="margin-bottom: 16px;">
      <input type="checkbox" v-model="rememberMe" />
      <span class="text-secondary" style="font-size: 13px;">记住我（保存会话，自动恢复）</span>
    </label>

    <button class="btn btn-primary" style="width: 100%;" @click="doLogin" :disabled="loading">
      {{ loading ? '登录中...' : '登录' }}
    </button>

    <p v-if="error" class="text-muted" style="margin-top: 12px; text-align: center; color: var(--color-busy);">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useSession } from '../composables/useSession.js';

const { login, loginError, loginLoading } = useSession();

const username = ref('');
const password = ref('');
const rememberMe = ref(true);
const error = ref('');
const loading = ref(false);

async function doLogin() {
  if (!username.value.trim() || !password.value) {
    error.value = '请输入用户名和密码';
    return;
  }
  loading.value = true;
  await login(username.value.trim(), password.value, rememberMe.value);
  // login 内部会切换视图到 main 或 twofa
  loading.value = false;
  error.value = loginError.value;
}
</script>

<style scoped>
.login-card {
  padding: 28px;
}

.remember-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
</style>