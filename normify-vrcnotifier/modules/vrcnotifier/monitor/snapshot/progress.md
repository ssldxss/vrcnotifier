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
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.272Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
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
