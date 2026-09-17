---
uid: 0717e08f
id: vrcnotifier.web.app.shell.theme
parent: vrcnotifier.web.app.shell
name: {zh: "主题切换", en: "Theme Switching"}
description:
  zh: >
      浅色、深色，或者跟随系统。
      
  en: >
      Light, dark, or follow the system.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.927Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 2137
    end_line: 2157
apis:
  - protocol: rpc
    path: "applyTheme(mode)"
    description:
      zh: >
          应用自动/浅色/深色主题并持久化选择。
          
      en: >
          Apply auto, light or dark theme and persist the choice.
          
  - protocol: rpc
    path: "cycleTheme()"
    description:
      zh: >
          从顶部按钮顺序循环主题。
          
      en: >
          Cycle themes in order from the header button.
          
deps:
  - kind: dataflow
    to: vrcnotifier.web.shell
    label: {zh: "切换外壳样式", en: "Toggle shell styling"}
---
