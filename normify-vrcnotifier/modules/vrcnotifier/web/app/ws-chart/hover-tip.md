---
uid: a9598df9
id: vrcnotifier.web.app.ws-chart.hover-tip
parent: vrcnotifier.web.app.ws-chart
name: {zh: "图表悬停提示", en: "Chart Hover Tooltip"}
description:
  zh: >
      让速率图表的悬停不闪烁。停留延迟使指针扫过图表时不会闪出一串提示；宽限期则桥接柱与柱之间的一像素空隙，使指针跨过空隙时提示不会消失。提示是挂在 body 上的元素而非画布容器的子元素，因此永远不会被图表的 overflow 裁掉。
      
  en: >
      Hovering the rate chart without it flickering. A dwell delay means simply dragging the pointer across the chart does not flash tooltips, and a grace period bridges the one-pixel gaps between bars so the tip does not vanish while the pointer crosses one. The tooltip is a body-level element rather than a child of the canvas container, so it can never be clipped by the chart's overflow.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:32:30.745Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 1712
    end_line: 1829
apis:
  - protocol: rpc
    path: "wsChartBarAt(mx)"
    description:
      zh: >
          命中检测指针下的柱子。
      en: >
          Hit-test the bar under the pointer.
  - protocol: rpc
    path: "wsChartShowTip(bar)"
    description:
      zh: >
          停留一段时间后显示提示。
      en: >
          Show the tooltip after a dwell delay.
  - protocol: rpc
    path: "wsChartHideTip()"
    description:
      zh: >
          宽限期后淡出提示。
      en: >
          Fade the tooltip out after a grace period.
  - protocol: rpc
    path: "wsChartUpdateHover()"
    description:
      zh: >
          每帧更新悬停状态。
      en: >
          Update hover state each frame.
---
