---
uid: 8b24b65b
id: vrcnotifier.server.auth.auto-login
parent: vrcnotifier.server.auth
name: {zh: "自动登录恢复", en: "Automatic Login Recovery"}
description:
  zh: >
      下次启动时自动恢复登录；失败就等一会儿再试，而且越试间隔越长。
      
  en: >
      Restores the previous login on the next start; on failure it retries with growing gaps between attempts.
      
revision: 930418f49d1a47dbbb3be7908060037f3d8dfdac
updated_at: "2026-09-17T06:14:56.798Z"
fingerprint: c6db8c1bef3c17e3fc24d177824020b0d73f7c641dbcc2e7a715555db2840ffb
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
          重试的时间一次比一次等得久，并加一点随机。
          
      en: >
          Wait longer before each retry, with a little randomness.
          
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
    label: {zh: "成功后建会话", en: "Finalize on success"}
  - kind: call
    to: vrcnotifier.server.auth.relogin.loop
    label: {zh: "升级为重登", en: "Escalate to re-login"}
  - kind: call
    to: vrcnotifier.qq.notifier
    label: {zh: "推送会话过期", en: "Notify session expiry"}
---
