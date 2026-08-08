<template>
  <div class="gate glass-card" style="max-width: 420px; margin: 0 auto;">
    <h2 style="margin-bottom: 16px; font-size: 18px;">连接后端</h2>
    <p class="text-muted" style="margin-bottom: 16px;">
      填写后端地址与访问令牌（后端启动时日志中打印），点击连接。
    </p>

    <div style="margin-bottom: 12px;">
      <label class="text-secondary" style="display: block; margin-bottom: 4px; font-size: 13px;">后端地址</label>
      <input
        v-model="url"
        type="text"
        placeholder="http://127.0.0.1:3000"
        @keyup.enter="doConnect"
      />
    </div>

    <div style="margin-bottom: 16px;">
      <label class="text-secondary" style="display: block; margin-bottom: 4px; font-size: 13px;">访问令牌</label>
      <input
        v-model="token"
        type="password"
        placeholder="输入访问令牌"
        @keyup.enter="doConnect"
      />
    </div>

    <button class="btn btn-primary" style="width: 100%;" @click="doConnect" :disabled="connecting">
      {{ connecting ? '连接中...' : '连接' }}
    </button>
    <p v-if="error" class="text-muted" style="margin-top: 12px; color: var(--color-busy);">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useSession } from '../composables/useSession.js';
import { useApi } from '../composables/useApi.js';

const { init, connect } = useSession();
const { accessToken, baseUrl } = useApi();

const url = ref(baseUrl());
const token = ref(accessToken());
const connecting = ref(false);
const error = ref('');

async function doConnect() {
  if (!token.value.trim()) {
    error.value = '未填写访问令牌，无法连接';
    return;
  }
  connecting.value = true;
  error.value = '';
  connect(url.value, token.value.trim());
  // 重新初始化
  await init();
  connecting.value = false;
}
</script>