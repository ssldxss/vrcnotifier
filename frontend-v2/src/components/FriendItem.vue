<template>
  <div class="friend-row" :class="{ 'is-monitored': isMonitored }">
    <!-- 头像 + 状态指示器 -->
    <div class="avatar-wrap" :class="statusClass" @click="toggleMonitor">
      <img
        v-if="avatarSrc"
        :src="avatarSrc"
        class="avatar-img"
        loading="lazy"
        @error="onAvatarError"
      />
      <div v-if="!avatarSrc || avatarFailed" class="avatar-fallback">
        {{ initial }}
      </div>
      <!-- 状态色环 -->
      <div class="status-ring" :class="statusClass"></div>
      <!-- 在线指示小点 -->
      <div v-if="f.state === 'online'" class="status-dot online"></div>
      <div v-else-if="f.state === 'active'" class="status-dot active"></div>
      <div v-else class="status-dot offline"></div>
    </div>

    <!-- 名字 + 状态描述 -->
    <div class="info" @click="toggleMonitor">
      <div class="name">{{ f.display_name || f.friend_vrchat_id }}</div>
      <div class="detail">
        <template v-if="f.state === 'online'">
          <span v-if="f.world_id === 'private'" class="world-icon">🔒</span>
          <span v-else-if="f.world_id === 'traveling'" class="world-icon">✈</span>
          <span v-else class="world-icon">🌐</span>
          {{ worldText }}
        </template>
        <template v-else-if="f.state === 'active'">
          {{ f.status_description || '网页在线' }}
        </template>
        <template v-else>
          {{ f.status_description || '离线' }}
        </template>
      </div>
    </div>

    <!-- 监控开关 -->
    <label class="switch" @click.stop>
      <input type="checkbox" :checked="isMonitored" @change="onToggleMonitor" />
      <span class="slider"></span>
    </label>

    <!-- 通知类型 -->
    <div class="notify-checks" v-if="isMonitored">
      <label class="notify-check" title="上线通知">
        <input type="checkbox" :checked="cfg.notify_online" @change="emitConfig('notify_online', $event.target.checked)" />
        <span>上线</span>
      </label>
      <label class="notify-check" title="下线通知">
        <input type="checkbox" :checked="cfg.notify_offline" @change="emitConfig('notify_offline', $event.target.checked)" />
        <span>下线</span>
      </label>
      <label class="notify-check" title="状态变化">
        <input type="checkbox" :checked="cfg.notify_status_change" @change="emitConfig('notify_status_change', $event.target.checked)" />
        <span>状态</span>
      </label>
      <label class="notify-check" title="切换世界">
        <input type="checkbox" :checked="cfg.notify_world_change" @change="emitConfig('notify_world_change', $event.target.checked)" />
        <span>世界</span>
      </label>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useApi } from '../composables/useApi.js';

const props = defineProps({
  friend: { type: Object, required: true }
});

const emit = defineEmits(['config-change']);

const { avatarUrl } = useApi();
const avatarFailed = ref(false);

const f = computed(() => props.friend);
const cfg = computed(() => f.value.config || {});
const isMonitored = computed(() => cfg.value.monitor_enabled === 1);

const avatarSrc = computed(() => {
  if (avatarFailed.value) return '';
  return f.value.avatarKey ? avatarUrl(f.value.avatarKey) : '';
});

const initial = computed(() => {
  return (f.value.display_name || '?').charAt(0).toUpperCase();
});

const statusClass = computed(() => {
  if (f.value.state === 'online') return 'ring-online';
  if (f.value.state === 'active') return 'ring-active';
  return 'ring-offline';
});

const worldText = computed(() => {
  if (f.value.world_id === 'private') return '私密世界';
  if (f.value.world_id === 'traveling') return '旅行中';
  if (f.value.world_name) return f.value.world_name;
  return f.value.world_id ? '未知世界' : '';
});

function onAvatarError() {
  avatarFailed.value = true;
}

function toggleMonitor() {
  onToggleMonitor();
}

function onToggleMonitor() {
  emitConfig('monitor_enabled', isMonitored.value ? 0 : 1);
}

function emitConfig(key, value) {
  const body = {
    monitorEnabled: key === 'monitor_enabled' ? value : (isMonitored.value ? 1 : 0),
    notifyOnline: key === 'notify_online' ? value : (cfg.value.notify_online || false),
    notifyOffline: key === 'notify_offline' ? value : (cfg.value.notify_offline || false),
    notifyStatusChange: key === 'notify_status_change' ? value : (cfg.value.notify_status_change || false),
    notifyWorldChange: key === 'notify_world_change' ? value : (cfg.value.notify_world_change || false)
  };
  emit('config-change', f.value.friend_vrchat_id, body);
}
</script>

<style scoped>
.friend-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--divider);
  transition: background 0.1s;
}

.friend-row:hover {
  background: var(--btn-secondary-bg);
  border-radius: 8px;
}

.friend-row:last-child {
  border-bottom: none;
}

/* 头像 */
.avatar-wrap {
  position: relative;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  cursor: pointer;
}

.avatar-img {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-fallback {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--btn-secondary-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-muted);
}

/* 状态色环 */
.status-ring {
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  border: 2px solid transparent;
  pointer-events: none;
}

.status-ring.ring-online {
  border-color: var(--color-online);
}

.status-ring.ring-active {
  border-color: var(--color-active);
}

.status-ring.ring-offline {
  border-color: transparent;
}

/* 状态小点 */
.status-dot {
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--glass-bg);
  backdrop-filter: blur(4px);
}

.status-dot.online {
  background: var(--color-online);
}

.status-dot.active {
  background: var(--color-active);
}

.status-dot.offline {
  background: var(--color-offline);
}

/* 信息 */
.info {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.world-icon {
  font-size: 11px;
}

/* 通知类型 */
.notify-checks {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.notify-check {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
}

.notify-check input[type='checkbox'] {
  width: 14px;
  height: 14px;
}
</style>