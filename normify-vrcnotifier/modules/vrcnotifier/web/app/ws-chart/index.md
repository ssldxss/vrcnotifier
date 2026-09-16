---
uid: 67e71d55
id: vrcnotifier.web.app.ws-chart
parent: vrcnotifier.web.app
name: {zh: "WebSocket 速率图表", en: "WebSocket Rate Chart"}
description:
  zh: >
      WebSocket 消息速率图表：在帧循环中平滑左移的 canvas、带停留延迟的悬停交互，以及把它锚定到真实时间的秒级数据流。
      
  en: >
      The WebSocket message-rate chart: a canvas that scrolls smoothly on a frame loop, a hover interaction with a dwell delay, and the second-by-second feed that keeps it anchored to real time.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
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
