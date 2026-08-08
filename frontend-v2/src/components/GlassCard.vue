<template>
  <div class="glass-card">
    <slot />
  </div>
</template>

<style scoped>
.glass-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  box-shadow: var(--glass-shadow);
  backdrop-filter: blur(var(--blur-amount));
  -webkit-backdrop-filter: blur(var(--blur-amount));
  padding: 20px;
  margin-bottom: 16px;
}
</style>