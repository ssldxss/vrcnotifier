---
uid: 56ce4018
id: vrcnotifier.web.app.boot
parent: vrcnotifier.web.app
name: {zh: "启动等待页", en: "Boot Overlay"}
description:
  zh: >
      登录时那四行等待动画。
      
  en: >
      The four-line waiting animation shown while signing in.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:21:00.012Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
deps:
  - kind: call
    to: vrcnotifier.web.app.boot.state-machine
    label: {zh: "启动状态机", en: "Boot state machine"}
  - kind: call
    to: vrcnotifier.web.app.boot.percent-odometer
    label: {zh: "百分比里程表", en: "Percentage odometer"}
  - kind: call
    to: vrcnotifier.web.app.boot.halo
    label: {zh: "光环动画", en: "Halo animation"}
  - kind: call
    to: vrcnotifier.web.app.boot.entrance
    label: {zh: "预热与入场", en: "Prewarm and entrance"}
---
