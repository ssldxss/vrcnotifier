---
uid: 8b24b65b
id: vrcnotifier.server.auth.auto-login
parent: vrcnotifier.server.auth
name: {zh: "自动登录恢复", en: "Automatic Login Recovery"}
description:
  zh: >
      用持久化的 cookie 恢复已保存会话：成功即落地；失败按可重试（401/429/网络/5xx）与终止分类。401 且存有密码时升级到重登引擎而不退避；cookie 全部过期或连续 3 次 401 会推送一次登录过期通知，其余情况按指数退避加抖动继续重试。
      
  en: >
      Restores the saved session from persisted cookies: on success it finalizes the session; failures are classified into retryable (401/429/network/5xx) and terminal. A 401 with a saved password escalates to the relogin engine instead of backing off; an expired cookie jar or three consecutive 401s produce a one-time session-expired notice, after which retries continue with exponential backoff and jitter.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:44.403Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
source:
  - path: "src/server.js"
    line: 238
    end_line: 352
apis:
  - protocol: rpc
    path: "tryAutoLogin()"
    description:
      zh: >
          带守卫的会话恢复（即发即忘）。
          
      en: >
          Fire-and-forget session restore with guards.
          
  - protocol: rpc
    path: "attemptAutoLogin(saved)"
    description:
      zh: >
          用已保存 cookie 恢复登录并分类失败原因。
          
      en: >
          Restore from saved cookies and classify failures.
          
  - protocol: rpc
    path: "scheduleAutoLoginRetry(saved)"
    description:
      zh: >
          指数退避加抖动的重试排期。
          
      en: >
          Schedule the next attempt with exponential backoff and jitter.
          
  - protocol: rpc
    path: "cookieJarExpired(jar, atMs)"
    description:
      zh: >
          判断已保存 cookie 是否全部过期。
          
      en: >
          True when every saved cookie is already expired.
          
  - protocol: rpc
    path: "notifySessionExpired(savedRow, reason)"
    description:
      zh: >
          推送一次性的登录过期通知。
          
      en: >
          Push a one-shot session-expired notice.
          
  - protocol: rpc
    path: "getConnectionStatus(dbId)"
    description:
      zh: >
          供 QQ 回复使用的连接状态。
          
      en: >
          Connection status used by QQ replies.
          
deps:
  - kind: call
    to: vrcnotifier.data.users
    label: {zh: "读已保存登录", en: "Read the saved login"}
  - kind: call
    to: vrcnotifier.vrc.api.transport
    label: {zh: "探测会话", en: "Probe the session"}
  - kind: call
    to: vrcnotifier.vrc.cookiejar
    label: {zh: "恢复 cookie jar", en: "Restore the cookie jar"}
  - kind: call
    to: vrcnotifier.server.auth.session
    label: {zh: "成功则落地", en: "Finalize on success"}
  - kind: call
    to: vrcnotifier.server.auth.relogin.loop
    label: {zh: "升级为重登", en: "Escalate to re-login"}
  - kind: call
    to: vrcnotifier.qq.notifier
    label: {zh: "推送会话过期", en: "Notify session expiry"}
---
