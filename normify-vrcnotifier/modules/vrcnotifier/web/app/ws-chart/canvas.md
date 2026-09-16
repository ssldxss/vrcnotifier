---
uid: c7b3d735
id: vrcnotifier.web.app.ws-chart.canvas
parent: vrcnotifier.web.app.ws-chart
name: {zh: "图表画布与数据流", en: "Chart Canvas & Feed"}
description:
  zh: >
      图表锚定到墙上时间而非到达顺序，因此繁忙的事件循环漏掉一次 tick 也不会悄悄把整条序列错位：ticker 会重发最近几秒，客户端按秒幂等合并。渐变取自解析后的主题色而非硬编码，因此会跟随主题切换；面板不可见时绘制循环完全暂停。
      
  en: >
      The chart is anchored to wall-clock time rather than to arrival order, so a busy event loop that misses a tick cannot silently shift the whole series: the ticker re-sends the last few seconds and the client merges them idempotently by second. Gradients are read from resolved theme colours instead of hard-coded, so the chart follows theme switches, and the drawing loop pauses entirely when the panel is off-screen.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
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
          写入某一秒的计数，按秒幂等。
          
      en: >
          Push one second's count, keyed idempotently by second.
          
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
