<template>
  <div class="theme-toggle">
    <button class="theme-btn" @click="cycle">
      <span class="icon">{{ icon }}</span>
    </button>
    <div class="theme-dropdown" v-if="open" @mouseleave="open = false">
      <button
        v-for="opt in options"
        :key="opt.value"
        class="theme-option"
        :class="{ active: theme === opt.value }"
        @click="select(opt.value)"
      >{{ opt.label }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useTheme } from '../composables/useTheme.js';

const { theme, setTheme } = useTheme();
const open = ref(false);

const options = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色模式' },
  { value: 'dark', label: '深色模式' }
];

const icon = computed(() => {
  if (theme.value === 'light') return '☀️';
  if (theme.value === 'dark') return '🌙';
  return '💻';
});

function cycle() {
  const idx = options.findIndex((o) => o.value === theme.value);
  const next = (idx + 1) % options.length;
  select(options[next].value);
}

function select(val) {
  setTheme(val);
  open.value = false;
}
</script>

<style scoped>
.theme-toggle {
  position: relative;
}

.theme-btn {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: var(--btn-secondary-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: background 0.15s;
}

.theme-btn:hover {
  background: var(--btn-secondary-hover);
}

.icon {
  line-height: 1;
}

.theme-dropdown {
  position: absolute;
  right: 0;
  top: 40px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--glass-shadow);
  backdrop-filter: blur(var(--blur-amount));
  -webkit-backdrop-filter: blur(var(--blur-amount));
  padding: 4px;
  min-width: 120px;
  z-index: 200;
}

.theme-option {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-primary);
  background: transparent;
  text-align: left;
  transition: background 0.1s;
}

.theme-option:hover {
  background: var(--btn-secondary-bg);
}

.theme-option.active {
  color: var(--accent);
  font-weight: 500;
}
</style>