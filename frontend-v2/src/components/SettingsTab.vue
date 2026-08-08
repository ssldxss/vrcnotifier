<template>
  <div>
    <h2 style="margin-bottom: 16px; font-size: 15px;">通知设置</h2>

    <!-- QQ -->
    <SettingsSection title="QQ 机器人（推荐）" :testKind="'qq'" @test="testChannel">
      <div class="grid2">
        <div class="field">
          <label>启用</label>
          <select v-model.number="form.qq_enabled">
            <option :value="0">关闭</option>
            <option :value="1">开启</option>
          </select>
        </div>
        <div class="field">
          <label>AppID</label>
          <input v-model="form.qq_app_id" type="text" placeholder="QQ 开放平台 AppID" />
        </div>
        <div class="field">
          <label>AppSecret</label>
          <input v-model="qqSecretInput" type="password" placeholder="留空保持不变" />
        </div>
      </div>
      <p class="text-muted" style="font-size: 12px; margin-top: 4px;">
        在 <a href="https://q.qq.com/qqbot" target="_blank" rel="noopener">QQ 开放平台</a> 创建机器人，填入后保存，在 QQ 给机器人发消息完成绑定。
      </p>
    </SettingsSection>

    <!-- 邮件 -->
    <SettingsSection title="邮件 (SMTP)" :testKind="'email'" @test="testChannel">
      <div class="grid2">
        <div class="field">
          <label>启用</label>
          <select v-model.number="form.smtp_enabled">
            <option :value="0">关闭</option>
            <option :value="1">开启</option>
          </select>
        </div>
        <div class="field">
          <label>收件邮箱</label>
          <input v-model="form.email" type="email" placeholder="you@example.com" />
        </div>
        <div class="field">
          <label>SMTP 主机</label>
          <input v-model="form.smtp_host" type="text" placeholder="smtp.example.com" />
        </div>
        <div class="field">
          <label>SMTP 端口</label>
          <input v-model.number="form.smtp_port" type="number" />
        </div>
        <div class="field">
          <label>SMTP 用户</label>
          <input v-model="form.smtp_user" type="text" />
        </div>
        <div class="field">
          <label>SMTP 密码</label>
          <input v-model="smtpPassInput" type="password" placeholder="留空保持不变" />
        </div>
        <div class="field">
          <label style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" v-model="form.smtp_secure" style="width: auto;" />
            SSL/TLS
          </label>
        </div>
      </div>
    </SettingsSection>

    <!-- Gotify -->
    <SettingsSection title="Gotify" :testKind="'gotify'" @test="testChannel">
      <div class="grid2">
        <div class="field">
          <label>启用</label>
          <select v-model.number="form.gotify_enabled">
            <option :value="0">关闭</option>
            <option :value="1">开启</option>
          </select>
        </div>
        <div class="field">
          <label>服务器地址</label>
          <input v-model="form.gotify_server_url" type="text" placeholder="https://gotify.example.com" />
        </div>
        <div class="field">
          <label>App Token</label>
          <input v-model="gotifyTokenInput" type="password" placeholder="留空保持不变" />
        </div>
        <div class="field">
          <label>优先级</label>
          <input v-model.number="form.gotify_priority" type="number" />
        </div>
      </div>
    </SettingsSection>

    <!-- NTFY -->
    <SettingsSection title="NTFY" :testKind="'ntfy'" @test="testChannel">
      <div class="grid2">
        <div class="field">
          <label>启用</label>
          <select v-model.number="form.ntfy_enabled">
            <option :value="0">关闭</option>
            <option :value="1">开启</option>
          </select>
        </div>
        <div class="field">
          <label>服务器地址</label>
          <input v-model="form.ntfy_server_url" type="text" placeholder="https://ntfy.sh" />
        </div>
        <div class="field">
          <label>Topic</label>
          <input v-model="form.ntfy_topic" type="text" />
        </div>
        <div class="field">
          <label>优先级</label>
          <input v-model.number="form.ntfy_priority" type="number" />
        </div>
      </div>
    </SettingsSection>

    <!-- Webhook -->
    <SettingsSection title="Webhook" :testKind="'webhook'" @test="testChannel">
      <div class="grid2">
        <div class="field">
          <label>启用</label>
          <select v-model.number="form.webhook_enabled">
            <option :value="0">关闭</option>
            <option :value="1">开启</option>
          </select>
        </div>
        <div class="field">
          <label>URL</label>
          <input v-model="form.webhook_url" type="text" placeholder="https://example.com/hook" />
        </div>
        <div class="field">
          <label>方法</label>
          <select v-model="form.webhook_method">
            <option>POST</option>
            <option>GET</option>
          </select>
        </div>
        <div class="field">
          <label>Content-Type</label>
          <input v-model="form.webhook_content_type" type="text" />
        </div>
      </div>
      <div class="field" style="margin-top: 8px;">
        <label>自定义 Headers (JSON)</label>
        <textarea v-model="form.webhook_headers" rows="2" placeholder='{"X-Token": "abc"}'></textarea>
      </div>
      <div class="field" style="margin-top: 8px;">
        <label>Body 模板 (可选)</label>
        <textarea v-model="form.webhook_body_template" rows="2" placeholder="留空使用默认 JSON"></textarea>
      </div>
    </SettingsSection>

    <!-- 保存 -->
    <div style="display: flex; align-items: center; gap: 12px; margin-top: 16px;">
      <button class="btn btn-primary" @click="doSave" :disabled="saving">
        {{ saving ? '保存中...' : '保存设置' }}
      </button>
      <span v-if="saveMsg" class="text-muted" style="font-size: 13px;">{{ saveMsg }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useSettings } from '../composables/useSettings.js';
import SettingsSection from './SettingsSection.vue';

const { settings, saving, saveMsg, loadSettings, saveSettings, testNotification } = useSettings();

const form = reactive({});
const smtpPassInput = ref('');
const gotifyTokenInput = ref('');
const qqSecretInput = ref('');

const MASK = '••••••••';
const SECRET_FIELDS = new Set(['smtp_pass', 'gotify_app_token', 'qq_app_secret']);

// 弹窗展示测试结果
function testChannel(kind) {
  testNotification(kind).then((r) => {
    const ok = r && r.ok;
    const msg = ok ? '测试推送已发送' : ((r && r.reason) || '发送失败');
    alert(`${kind}: ${msg}`);
  });
}

function doSave() {
  const body = {
    smtp_enabled: form.smtp_enabled,
    email: form.email || null,
    smtp_host: form.smtp_host || null,
    smtp_port: form.smtp_port || null,
    smtp_secure: form.smtp_secure ? 1 : 0,
    smtp_user: form.smtp_user || null,
    gotify_enabled: form.gotify_enabled,
    gotify_server_url: form.gotify_server_url || null,
    gotify_priority: form.gotify_priority ?? 5,
    ntfy_enabled: form.ntfy_enabled,
    ntfy_server_url: form.ntfy_server_url || null,
    ntfy_topic: form.ntfy_topic || null,
    ntfy_priority: form.ntfy_priority ?? 3,
    webhook_enabled: form.webhook_enabled,
    webhook_url: form.webhook_url || null,
    webhook_method: form.webhook_method || 'POST',
    webhook_content_type: form.webhook_content_type || 'application/json',
    webhook_headers: form.webhook_headers || null,
    webhook_body_template: form.webhook_body_template || null,
    qq_enabled: form.qq_enabled,
    qq_app_id: form.qq_app_id || null
  };
  if (smtpPassInput.value) body.smtp_pass = smtpPassInput.value;
  if (gotifyTokenInput.value) body.gotify_app_token = gotifyTokenInput.value;
  if (qqSecretInput.value) body.qq_app_secret = qqSecretInput.value;

  saveSettings(body);
  smtpPassInput.value = '';
  gotifyTokenInput.value = '';
  qqSecretInput.value = '';
}

onMounted(async () => {
  await loadSettings();
  const s = settings.value;
  form.smtp_enabled = s.smtp_enabled ?? 0;
  form.email = s.email || '';
  form.smtp_host = s.smtp_host || '';
  form.smtp_port = s.smtp_port ?? 587;
  form.smtp_secure = s.smtp_secure ? 1 : 0;
  form.smtp_user = s.smtp_user || '';
  form.gotify_enabled = s.gotify_enabled ?? 0;
  form.gotify_server_url = s.gotify_server_url || '';
  form.gotify_priority = s.gotify_priority ?? 5;
  form.ntfy_enabled = s.ntfy_enabled ?? 0;
  form.ntfy_server_url = s.ntfy_server_url || '';
  form.ntfy_topic = s.ntfy_topic || '';
  form.ntfy_priority = s.ntfy_priority ?? 3;
  form.webhook_enabled = s.webhook_enabled ?? 0;
  form.webhook_url = s.webhook_url || '';
  form.webhook_method = s.webhook_method || 'POST';
  form.webhook_content_type = s.webhook_content_type || 'application/json';
  form.webhook_headers = s.webhook_headers || '';
  form.webhook_body_template = s.webhook_body_template || '';
  form.qq_enabled = s.qq_enabled ?? 0;
  form.qq_app_id = s.qq_app_id || '';
});
</script>

<style scoped>
.field {
  margin-bottom: 8px;
}

.field label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 3px;
}
</style>