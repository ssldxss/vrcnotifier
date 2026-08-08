<template>
  <div class="glass-card" style="width: 380px; padding: 28px;">
    <h2 style="margin-bottom: 12px; font-size: 18px; text-align: center;">两步验证</h2>
    <p class="text-muted" style="margin-bottom: 16px; text-align: center;">
      请输入{{ kindLabel }}验证码
    </p>

    <div style="margin-bottom: 16px;">
      <input
        v-model="code"
        type="text"
        placeholder="6 位验证码"
        autocomplete="one-time-code"
        @keyup.enter="doVerify"
      />
    </div>

    <div style="display: flex; gap: 8px;">
      <button class="btn btn-secondary" style="flex: 1;" @click="cancel2fa">取消</button>
      <button class="btn btn-primary" style="flex: 1;" @click="doVerify" :disabled="loading">
        {{ loading ? '验证中...' : '验证' }}
      </button>
    </div>

    <p v-if="error" class="text-muted" style="margin-top: 12px; text-align: center; color: var(--color-busy);">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useSession } from '../composables/useSession.js';

const { twofaKind, verify2fa, cancel2fa, loginError, loginLoading } = useSession();

const code = ref('');
const error = ref('');

const kindLabel = computed(() => {
  const k = twofaKind.value;
  if (k === 'emailOtp') return '邮箱';
  if (k === 'totp') return 'TOTP';
  return '备用';
});

async function doVerify() {
  if (!code.value.trim()) {
    error.value = '请输入验证码';
    return;
  }
  await verify2fa(code.value.trim());
  error.value = loginError.value;
}
</script>