---
uid: b6282e36
id: vrcnotifier.web.app.sse-events
parent: vrcnotifier.web.app
name: {zh: "实时消息接收", en: "Receiving Live Updates"}
description:
  zh: >
      接收后端主动推来的消息，分给对应的地方处理。
      
  en: >
      Receives the messages the backend pushes, and hands each to the right place.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.927Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 1930
    end_line: 2005
apis:
  - protocol: rpc
    path: "connectEvents()"
    description:
      zh: >
          打开事件流并为每个命名事件绑定处理函数。
          
      en: >
          Open the event stream and wire one handler per named event.
          
deps:
  - kind: call
    to: vrcnotifier.web.sdk
    label: {zh: "打开事件流", en: "Open the event stream"}
  - kind: call
    to: vrcnotifier.web.app.boot.state-machine
    label: {zh: "喂登录进度", en: "Feed login progress"}
  - kind: call
    to: vrcnotifier.web.app.roster
    label: {zh: "应用在线变化", en: "Apply presence changes"}
  - kind: call
    to: vrcnotifier.web.app.log-viewer
    label: {zh: "推送后端日志", en: "Stream backend logs"}
  - kind: call
    to: vrcnotifier.web.app.status
    label: {zh: "更新状态徽章", en: "Update status badges"}
  - kind: call
    to: vrcnotifier.web.app.ws-chart.canvas
    label: {zh: "喂速率图表", en: "Feed the rate chart"}
---
