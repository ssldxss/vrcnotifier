---
uid: 0717e08f
id: vrcnotifier.web.app.shell.theme
parent: vrcnotifier.web.app.shell
name: {zh: "主题切换", en: "Theme Switching"}
description:
  zh: >
      主题切换在显式的浅色与深色之外还提供跟随系统，且“自动”真的跟随系统变化而不是只猜一次：系统偏好改变时会重新求值。选择持久化在内联头部脚本读取的同一个键上，因此正确主题在首帧前就已应用，面板永远不会闪一下错误的主题。
      
  en: >
      The theme switch offers auto alongside the explicit light and dark choices, and auto genuinely follows the operating system rather than being a one-time guess: it re-evaluates when the system preference changes. The choice is persisted under the same key the inline head script reads, so the correct theme is applied before first paint and the panel never flashes the wrong one.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
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
