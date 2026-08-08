<template>
  <div class="app-shell">
    <!-- 顶部栏 -->
    <header class="glass-header top-bar">
      <div class="top-bar-inner">
        <h1 class="logo">vrcnotifier</h1>
        <span class="spacer"></span>
        <ThemeToggle />
        <span v-if="currentUser" class="user-label">{{ currentUser.display_name || currentUser.vrchat_user_id }}</span>
        <button v-if="currentUser" class="btn btn-secondary btn-sm" @click="doLogout">登出</button>
      </div>
    </header>

    <!-- 连接页面 -->
    <ConnectGate v-if="view === 'gate'" />

    <!-- 登录页面 -->
    <div v-if="view === 'login'" class="center-page fade-in">
      <LoginForm />
    </div>

    <!-- 2FA 页面 -->
    <div v-if="view === 'twofa'" class="center-page fade-in">
      <TwoFactorForm />
    </div>

    <!-- 主界面 -->
    <div v-if="view === 'main'" class="main-container fade-in">
      <div class="tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="tab-btn"
          :class="{ active: activeTab === t.key }"
          @click="activeTab = t.key"
        >{{ t.label }}</button>
      </div>

      <GlassCard v-if="activeTab === 'status'">
        <StatusTab />
      </GlassCard>

      <GlassCard v-if="activeTab === 'friends'">
        <FriendsTab />
      </GlassCard>

      <GlassCard v-if="activeTab === 'settings'">
        <SettingsTab />
      </GlassCard>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useSession } from './composables/useSession.js';
import { useStatus } from './composables/useStatus.js';
import GlassCard from './components/GlassCard.vue';
import ThemeToggle from './components/ThemeToggle.vue';
import ConnectGate from './components/ConnectGate.vue';
import LoginForm from './components/LoginForm.vue';
import TwoFactorForm from './components/TwoFactorForm.vue';
import StatusTab from './components/StatusTab.vue';
import FriendsTab from './components/FriendsTab.vue';
import SettingsTab from './components/SettingsTab.vue';

const { view, currentUser, init, logout } = useSession();
const { startPolling, stopPolling, connectEvents, disconnectEvents } = useStatus();

const activeTab = ref('status');
const tabs = [
  { key: 'status', label: '状态' },
  { key: 'friends', label: '好友' },
  { key: 'settings', label: '设置' }
];

async function doLogout() {
  stopPolling();
  disconnectEvents();
  await logout();
}

// 监听进入主界面
watch(view, (val) => {
  if (val === 'main') {
    startPolling();
    connectEvents();
  }
});

onMounted(() => {
  init();
});

onUnmounted(() => {
  stopPolling();
  disconnectEvents();
});
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.top-bar {
  position: sticky;
  top: 0;
  z-index: 100;
  padding: 12px 24px;
}

.top-bar-inner {
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.3px;
}

.spacer {
  flex: 1;
}

.user-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.center-page {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 80px;
  padding-inline: 16px;
}

.main-container {
  max-width: 960px;
  margin: 0 auto;
  padding: 20px 16px;
}

.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  padding: 4px;
  backdrop-filter: blur(var(--blur-amount));
  -webkit-backdrop-filter: blur(var(--blur-amount));
}

.tab-btn {
  flex: 1;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  transition: all 0.15s;
}

.tab-btn:hover {
  color: var(--text-primary);
  background: var(--btn-secondary-bg);
}

.tab-btn.active {
  color: var(--text-primary);
  background: var(--glass-bg);
  box-shadow: var(--glass-shadow-sm);
}
</style>