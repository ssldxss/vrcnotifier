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
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.884Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
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
