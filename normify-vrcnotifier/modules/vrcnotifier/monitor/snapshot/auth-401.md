---
uid: 4bcd2522
id: vrcnotifier.monitor.snapshot.auth-401
parent: vrcnotifier.monitor.snapshot
name: {zh: "对账 401 分流", en: "Reconciliation 401 Branching"}
description:
  zh: >
      VRChat 的 401 并不只有一种：Missing Credentials 表示 cookie 作废（典型是换 IP），需要带密码完整重登；Unauthorized 表示会话被挂起，只需重过一遍 2FA；其余则是会话彻底失效，需要通知用户并停用。正是这个分流让可恢复的抖动不会被当成登出。
      
  en: >
      VRChat's 401s are not one thing: 'Missing Credentials' means the cookie is void (typically an IP change) and asks for a full re-login with the password, 'Unauthorized' means the session is suspended and only needs the 2FA step again, and anything else is a dead session that is reported to the user and deactivated. The distinction is what keeps a recoverable hiccup from looking like a logout.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:32:07.299Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
    line: 834
    end_line: 853
apis:
  - protocol: rpc
    path: "handleAuth401(e, userId)"
    description:
      zh: >
          把 401 分流为自动重登、2FA 重验证或会话失效。
      en: >
          Split a 401 into relogin-needed, unauthorized-2fa or session-expired.
---
