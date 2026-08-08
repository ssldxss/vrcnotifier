<template>
  <div>
    <h2 style="margin-bottom: 14px; font-size: 15px;">运行状态</h2>

    <div class="grid2" style="margin-bottom: 16px;">
      <div class="stat-item">
        <span class="text-muted">登录用户</span>
        <span>{{ status.user ? (status.user.display_name || status.user.vrchat_user_id) : '-' }}</span>
      </div>
      <div class="stat-item">
        <span class="text-muted">WS 连接</span>
        <span :class="wsClass">{{ wsLabel }}</span>
      </div>
      <div class="stat-item">
        <span class="text-muted">上次快照</span>
        <span class="text-secondary">{{ status.lastSnapshotAt ? new Date(status.lastSnapshotAt).toLocaleTimeString() : '-' }}</span>
      </div>
      <div class="stat-item">
        <span class="text-muted">QQ</span>
        <span class="text-secondary">{{ qqLabel }}</span>
      </div>
    </div>

    <div style="display: flex; gap: 8px; margin-bottom: 16px;">
      <button class="btn btn-secondary btn-sm" @click="doRefreshFriends">刷新好友列表</button>
      <button class="btn btn-secondary btn-sm" @click="doSnapshot">立即对账</button>
      <span v-if="opMsg" class="text-muted" style="font-size: 12px; line-height: 2;">{{ opMsg }}</span>
    </div>

    <EventLog />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useStatus } from '../composables/useStatus.js';
import { useFriends } from '../composables/useFriends.js';
import { useApi } from '../composables/useApi.js';
import EventLog from './EventLog.vue';

const { status, loadStatus } = useStatus();
const { refreshFriends } = useFriends();
const { client } = useApi();

const opMsg = ref('');

const wsClass = computed(() => {
  if (!status.value.loggedIn) return 'text-secondary';
  if (status.value.wsConnected) return 'status-online';
  return 'status-warn';
});

const wsLabel = computed(() => {
  if (!status.value.loggedIn) return '-';
  if (status.value.wsConnected) return '已连接';
  return '未连接/重连中';
});

const qqLabel = computed(() => {
  const qq = status.value.qq;
  if (!qq || !qq.configured) return '未配置';
  const bound = qq.bound ? (qq.bound.nickname || qq.bound.openid) : null;
  return (qq.connected ? '已连接' : '未连接') + (bound ? ', 已绑定: ' + bound : ', 未绑定') + (qq.lastError ? ', 错误: ' + qq.lastError : '');
});

async function doRefreshFriends() {
  opMsg.value = '拉取中...';
  try {
    const r = await refreshFriends();
    opMsg.value = '已更新 ' + (r.added || 0) + ' 新增, ' + (r.updated || 0) + ' 更新';
  } catch (e) {
    opMsg.value = e.message || '刷新失败';
  }
}

async function doSnapshot() {
  opMsg.value = '对账中...';
  try {
    const r = await client.manualSnapshot();
    if (r.ok) {
      opMsg.value = '对账完成';
      await loadStatus();
    } else {
      opMsg.value = r.error || '对账失败';
    }
  } catch (e) {
    opMsg.value = e.message || '对账失败';
  }
}
</script>

<style scoped>
.stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 0;
  font-size: 13px;
}

.stat-item span:first-child {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-online {
  color: var(--color-online);
  font-weight: 500;
}

.status-warn {
  color: var(--color-askme);
  font-weight: 500;
}
</style>