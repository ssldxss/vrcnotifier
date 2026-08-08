<template>
  <div>
    <h3 style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">实时事件</h3>
    <div class="log-box">
      <div v-if="!events.length" class="text-muted empty-log">等待事件...</div>
      <div v-for="(e, i) in events" :key="i" class="log-line" :class="e.type">
        <span class="log-time">{{ e.time }}</span>
        <span>{{ formatEvent(e) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useStatus } from '../composables/useStatus.js';

const { events } = useStatus();

function formatEvent(e) {
  const d = e.data;
  switch (e.type) {
    case 'notification':
      return `通知已发: ${d.friendName || '?'} ${d.changeType || ''}`;
    case 'snapshot':
      return `快照完成: ${d.count || 0} 位好友`;
    case 'session-expired':
      return '会话已失效，请重新登录';
    case 'ws-failure':
      return `WS 连续断线: ${d.displayName || d.userId || ''}`;
    case 'ws-recovered':
      return 'WS 已恢复';
    default:
      return JSON.stringify(d);
  }
}
</script>

<style scoped>
.log-box {
  max-height: 200px;
  overflow: auto;
  font: 12px/1.6 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  background: var(--input-bg);
  border-radius: 8px;
  padding: 10px 12px;
}

.empty-log {
  padding: 8px 0;
}

.log-line {
  padding: 2px 0;
  border-bottom: 1px solid var(--divider);
  color: var(--text-secondary);
}

.log-line:last-child {
  border-bottom: none;
}

.log-line.session-expired {
  color: var(--color-busy);
}

.log-line.ws-failure {
  color: var(--color-askme);
}

.log-time {
  color: var(--text-muted);
  margin-right: 8px;
}
</style>