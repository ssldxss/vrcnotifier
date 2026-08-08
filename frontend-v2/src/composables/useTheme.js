import { ref, watchEffect } from 'vue';

const STORAGE_KEY = 'vrcn-theme';

function load() {
  try { return localStorage.getItem(STORAGE_KEY) || 'system'; }
  catch { return 'system'; }
}

function save(val) {
  try { localStorage.setItem(STORAGE_KEY, val); }
  catch { /* ignore */ }
}

const theme = ref(load());

watchEffect(() => {
  document.documentElement.setAttribute('data-theme', theme.value);
});

export function useTheme() {
  function setTheme(val) {
    theme.value = val;
    save(val);
  }

  return { theme, setTheme };
}