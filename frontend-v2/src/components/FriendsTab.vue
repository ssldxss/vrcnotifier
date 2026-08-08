<template>
  <div>
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
      <h2 style="font-size: 15px;">
        好友监控
        <span class="text-muted" style="font-size: 13px; font-weight: 400;">
          {{ monitoredCount }} / {{ friends.length }}
        </span>
      </h2>
      <button class="btn btn-secondary btn-sm" @click="doRefresh" :disabled="loading">
        {{ loading ? '刷新中...' : '刷新' }}
      </button>
    </div>

    <p class="text-muted" style="font-size: 12px; margin-bottom: 12px;">
      打开监控开关开始检测；上线/下线/状态/世界 控制通知类型。
    </p>

    <div v-if="!friends.length && !loading" class="text-muted" style="padding: 20px 0; text-align: center;">
      暂无好友数据，点击刷新拉取
    </div>

    <!-- 在线 -->
    <div v-if="onlineFriends.length">
      <div class="section-header" @click="toggleOnline">
        <span class="arrow" :class="{ open: showOnline }">▶</span>
        <span class="section-label">在线</span>
        <span class="section-count">{{ onlineFriends.length }}</span>
      </div>
      <div v-if="showOnline">
        <FriendItem
          v-for="f in onlineFriends"
          :key="f.friend_vrchat_id"
          :friend="f"
          @config-change="onConfigChange"
        />
      </div>
    </div>

    <!-- 网页在线 -->
    <div v-if="activeFriends.length">
      <div class="section-header" @click="toggleActive">
        <span class="arrow" :class="{ open: showActive }">▶</span>
        <span class="section-label">网页在线</span>
        <span class="section-count">{{ activeFriends.length }}</span>
      </div>
      <div v-if="showActive">
        <FriendItem
          v-for="f in activeFriends"
          :key="f.friend_vrchat_id"
          :friend="f"
          @config-change="onConfigChange"
        />
      </div>
    </div>

    <!-- 离线 -->
    <div v-if="offlineFriends.length">
      <div class="section-header" @click="toggleOffline">
        <span class="arrow" :class="{ open: showOffline }">▶</span>
        <span class="section-label">离线</span>
        <span class="section-count">{{ offlineFriends.length }}</span>
      </div>
      <div v-if="showOffline">
        <FriendItem
          v-for="f in offlineFriends"
          :key="f.friend_vrchat_id"
          :friend="f"
          @config-change="onConfigChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useFriends } from '../composables/useFriends.js';
import { useStatus } from '../composables/useStatus.js';
import FriendItem from './FriendItem.vue';

const { friends, loading, loadFriends, refreshFriends, updateConfig } = useFriends();
const { events } = useStatus();

const showOnline = ref(true);
const showActive = ref(true);
const showOffline = ref(false);

const onlineFriends = computed(() => friends.value.filter((f) => f.state === 'online'));
const activeFriends = computed(() => friends.value.filter((f) => f.state === 'active'));
const offlineFriends = computed(() => friends.value.filter((f) => f.state === 'offline'));
const monitoredCount = computed(() => friends.value.filter((f) => f.config && f.config.monitor_enabled === 1).length);

function toggleOnline() { showOnline.value = !showOnline.value; }
function toggleActive() { showActive.value = !showActive.value; }
function toggleOffline() { showOffline.value = !showOffline.value; }

async function doRefresh() {
  try {
    await refreshFriends();
  } catch (e) {
    /* ignore */
  }
}

async function onConfigChange(friendId, config) {
  await updateConfig(friendId, config);
}

// SSE 事件更新好友列表
watch(events, () => {
  // 收到通知或快照事件时刷新好友列表
  const latest = events.value[0];
  if (latest && (latest.type === 'notification' || latest.type === 'snapshot')) {
    loadFriends();
  }
}, { deep: true });

onMounted(() => {
  loadFriends();
});
</script>

<style scoped>
.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid var(--divider);
  transition: background 0.1s;
}

.section-header:hover {
  background: var(--btn-secondary-bg);
  border-radius: 6px;
}

.arrow {
  font-size: 10px;
  color: var(--text-muted);
  transition: transform 0.15s;
  display: inline-block;
  width: 14px;
}

.arrow.open {
  transform: rotate(90deg);
}

.section-label {
  font-size: 13px;
  font-weight: 500;
}

.section-count {
  font-size: 12px;
  color: var(--text-muted);
}
</style>