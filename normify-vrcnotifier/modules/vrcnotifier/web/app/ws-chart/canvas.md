---
uid: c7b3d735
id: vrcnotifier.web.app.ws-chart.canvas
parent: vrcnotifier.web.app.ws-chart
name: {zh: "图表绘制", en: "Chart Drawing"}
description:
  zh: >
      画图，并让它持续滚动。
      
  en: >
      Draws the chart and keeps it scrolling.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.689Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 1610
    end_line: 1711
  - path: "public/app.js"
    line: 1831
    end_line: 1928
apis:
  - protocol: rpc
    path: "wsChartDraw()"
    description:
      zh: >
          用主题感知的渐变绘制滚动柱状图。
          
      en: >
          Draw the scrolling bars with theme-aware gradients.
          
  - protocol: rpc
    path: "wsChartPush(sec, n)"
    description:
      zh: >
          写入某一秒的计数，同一秒重复写入不会算两次。
          
      en: >
          Push one second's count; the same second never counts twice.
          
  - protocol: rpc
    path: "renderWsChart(series)"
    description:
      zh: >
          在帧循环中把图表锚定到墙上时间，离屏时暂停。
          
      en: >
          Keep the chart anchored to wall time on a frame loop, paused off-screen.
          
  - protocol: rpc
    path: "wsChartGradientColors()"
    description:
      zh: >
          读取解析后的主题色供 canvas 渐变使用。
          
      en: >
          Read the resolved theme colours for canvas gradients.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.ws-chart.hover-tip
    label: {zh: "驱动悬停状态", en: "Drive hover state"}
---
