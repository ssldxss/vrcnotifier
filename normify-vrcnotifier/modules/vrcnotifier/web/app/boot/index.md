---
uid: 56ce4018
id: vrcnotifier.web.app.boot
parent: vrcnotifier.web.app
name: {zh: "启动等待页", en: "Boot Overlay"}
description:
  zh: >
      账号上线期间展示的四行等待浮层：语义状态机、让百分比滚动的数字条、逐行光环动画，以及主界面入场重放。
      
  en: >
      The four-line waiting overlay shown while the account is being brought online: a semantic state machine, the odometer that animates the percentage, the halo animations on each row and the page entrance replay.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
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
