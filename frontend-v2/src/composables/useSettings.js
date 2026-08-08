import { ref } from 'vue';
import { useApi } from './useApi.js';

const settings = ref({});
const saving = ref(false);
const saveMsg = ref('');

export function useSettings() {
  const { client } = useApi();

  async function loadSettings() {
    try {
      const r = await client.getSettings();
      if (r.ok && r.settings) settings.value = r.settings;
    } catch (e) {
      console.error('加载设置失败:', e.message);
    }
  }

  async function saveSettings(body) {
    saving.value = true;
    saveMsg.value = '';
    try {
      const r = await client.updateSettings(body);
      if (r.ok) {
        saveMsg.value = '已保存';
        await loadSettings();
      } else {
        saveMsg.value = r.error || '保存失败';
      }
    } catch (e) {
      saveMsg.value = e.message || '保存失败';
    } finally {
      saving.value = false;
    }
  }

  async function testNotification(kind) {
    try {
      const r = await client.testNotification(kind);
      return r;
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  return { settings, saving, saveMsg, loadSettings, saveSettings, testNotification };
}