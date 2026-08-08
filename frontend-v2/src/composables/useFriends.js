import { ref } from 'vue';
import { useApi } from './useApi.js';

const friends = ref([]);
const loading = ref(false);

export function useFriends() {
  const { client } = useApi();

  async function loadFriends() {
    loading.value = true;
    try {
      const r = await client.getFriends();
      if (r.friends) friends.value = r.friends;
    } catch (e) {
      console.error('加载好友失败:', e.message);
    } finally {
      loading.value = false;
    }
  }

  async function refreshFriends() {
    loading.value = true;
    try {
      const r = await client.refreshFriends();
      if (r.friends) friends.value = r.friends;
      return r;
    } catch (e) {
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function updateConfig(friendId, config) {
    const r = await client.updateFriendConfig(friendId, config);
    if (r.ok && r.config) {
      const idx = friends.value.findIndex((f) => f.friend_vrchat_id === friendId);
      if (idx >= 0) {
        friends.value[idx] = { ...friends.value[idx], config: r.config };
      }
    }
    return r;
  }

  return { friends, loading, loadFriends, refreshFriends, updateConfig };
}