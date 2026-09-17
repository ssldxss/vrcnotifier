---
uid: a9598df9
id: vrcnotifier.web.app.ws-chart.hover-tip
parent: vrcnotifier.web.app.ws-chart
name: {zh: "图表数值提示", en: "Chart Value Tooltip"}
description:
  zh: >
      鼠标停在图上时，显示那一刻的数字。
  en: >
      Shows the number for the moment your pointer is over.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:19:37.674Z"
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
