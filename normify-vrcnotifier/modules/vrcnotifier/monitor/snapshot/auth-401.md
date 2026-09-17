---
uid: 4bcd2522
id: vrcnotifier.monitor.snapshot.auth-401
parent: vrcnotifier.monitor.snapshot
name: {zh: "登录失效的判断", en: "Judging a Refused Check"}
description:
  zh: >
      核对时被拒绝，判断是密码过期了、需要验证码，还是会话彻底失效。
  en: >
      When the check is refused, works out whether the password expired, a code is needed, or the session is truly dead.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:18:39.661Z"
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
