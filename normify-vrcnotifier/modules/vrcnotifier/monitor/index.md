---
uid: cb383a2d
id: vrcnotifier.monitor
parent: vrcnotifier
name: {zh: "好友监控总控", en: "Friend Monitoring Control"}
description:
  zh: >
      监控的总指挥：盯着好友的一举一动，判断哪些值得告诉你。
      
  en: >
      The conductor of the whole thing: watches what your friends are doing and decides whether it is worth telling you.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.879Z"
fingerprint: d2c0c0283691b2039e943a7dc58698aefb974e2411815468321d3d2cab21798a
source:
  - path: "src/monitor.js"
deps:
  - kind: call
    to: vrcnotifier.monitor.state
    label: {zh: "保存状态", en: "Persist presence"}
  - kind: call
    to: vrcnotifier.monitor.notify
    label: {zh: "通知分发", en: "Dispatch notifications"}
  - kind: call
    to: vrcnotifier.monitor.snapshot
    label: {zh: "完整核对", en: "Reconcile snapshots"}
  - kind: call
    to: vrcnotifier.monitor.pipeline-router
    label: {zh: "WS 事件路由", en: "Route WS events"}
  - kind: call
    to: vrcnotifier.data
    label: {zh: "读写好友状态", en: "Reads & writes state"}
  - kind: call
    to: vrcnotifier.vrc
    label: {zh: "收 VRChat 事件", en: "Takes VRChat events"}
  - kind: call
    to: vrcnotifier.qq
    label: {zh: "发通知", en: "Sends notifications"}
---
