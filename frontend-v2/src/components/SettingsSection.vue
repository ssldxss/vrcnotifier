<template>
  <fieldset class="settings-section">
    <legend>{{ title }}</legend>
    <slot />
    <div style="margin-top: 10px;">
      <button class="btn btn-secondary btn-sm" @click="$emit('test', testKind)">发送测试推送</button>
    </div>
  </fieldset>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  testKind: { type: String, required: true }
});

defineEmits(['test']);
</script>

<style scoped>
.settings-section {
  border: 1px solid var(--divider);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  margin-bottom: 14px;
}

legend {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  padding: 0 6px;
}
</style>