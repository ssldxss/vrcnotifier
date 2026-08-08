import { ref } from 'vue';
import { useApi } from './useApi.js';

const status = ref({});
const events = ref([]);
const polling = ref(false);

let _pollTimer = null;
let _eventSource = null;

export function useStatus() {
  const { client, baseUrl, accessToken } = useApi();

  async function loadStatus() {
    try {
      const r = await client.getStatus();
      status.value = r;
    } catch (e) {
      /* ignore */
    }
  }

  function startPolling(intervalMs = 5000) {
    stopPolling();
    loadStatus();
    _pollTimer = setInterval(loadStatus, intervalMs);
    polling.value = true;
  }

  function stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    polling.value = false;
  }

  function addEvent(type, data) {
    events.value.unshift({
      type,
      data,
      time: new Date().toLocaleTimeString()
    });
    if (events.value.length > 60) events.value.pop();
  }

  function connectEvents() {
    disconnectEvents();
    const url = baseUrl() + '/api/events?token=' + encodeURIComponent(accessToken());
    const es = new EventSource(url);
    _eventSource = es;

    const knownEvents = ['notification', 'snapshot', 'session-expired', 'ws-failure', 'ws-recovered'];
    for (const name of knownEvents) {
      es.addEventListener(name, (e) => {
        let data = null;
        try { data = JSON.parse(e.data); } catch (err) { data = e.data; }
        addEvent(name, data);
      });
    }

    es.onerror = () => {
      /* SSE 断开后浏览器会自动重连 */
    };
  }

  function disconnectEvents() {
    if (_eventSource) {
      try { _eventSource.close(); } catch (e) { /* ignore */ }
      _eventSource = null;
    }
  }

  return { status, events, polling, loadStatus, startPolling, stopPolling, addEvent, connectEvents, disconnectEvents };
}