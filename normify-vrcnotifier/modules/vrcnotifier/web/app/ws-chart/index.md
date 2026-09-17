---
uid: 67e71d55
id: vrcnotifier.web.app.ws-chart
parent: vrcnotifier.web.app
name: {zh: "WebSocket 速率图表", en: "WebSocket Rate Chart"}
description:
  zh: >
      那个显示连接忙不忙的小折线图。
      
  en: >
      The small chart showing how busy the connection has been.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.929Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
deps:
  - kind: call
    to: vrcnotifier.web.app.ws-chart.canvas
    label: {zh: "图表画布", en: "Chart canvas"}
  - kind: call
    to: vrcnotifier.web.app.ws-chart.hover-tip
    label: {zh: "悬停提示", en: "Hover tooltip"}
---
