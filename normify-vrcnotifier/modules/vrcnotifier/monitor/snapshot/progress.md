---
uid: e1fd8bec
id: vrcnotifier.monitor.snapshot.progress
parent: vrcnotifier.monitor.snapshot
name: {zh: "核对进度上报", en: "Check Progress Reporting"}
description:
  zh: >
      把核对到哪一步了告诉等待页，让进度条如实走动。
      
  en: >
      Tells the waiting screen how far the check has got, so the progress bar stays honest.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:23:01.488Z"
fingerprint: ea088ca1010672a4d206d3d26e240acd50471b2ea31bd088667c9fdb6d00d8f0
source:
  - path: "src/monitor.js"
    line: 32
    end_line: 36
  - path: "src/monitor.js"
    line: 902
    end_line: 975
apis:
  - protocol: rpc
    path: "emitProgress(userId, payload)"
    description:
      zh: >
          上报点亮等待页的登录进度阶段。
          
      en: >
          Report the login-progress stage that lights up the boot overlay.
          
---
