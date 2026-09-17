---
uid: 299b192a
id: vrcnotifier.web.app.boot.percent-odometer
parent: vrcnotifier.web.app.boot
name: {zh: "百分比数字", en: "Percentage Number"}
description:
  zh: >
      那个滚动变化的百分比数字。
      
  en: >
      The rolling percentage number.
      
revision: 64a1a8c837de5d7fc9738124f5779478a2a90026
updated_at: "2026-09-17T12:23:49.299Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 704
    end_line: 785
apis:
  - protocol: rpc
    path: "bootPercent(fetched, total)"
    description:
      zh: >
          把已拉取/总数写入严格不降的百分比。
          
      en: >
          Feed a fetched/total pair into a strictly monotonic percentage.
          
  - protocol: rpc
    path: "bootPctStep()"
    description:
      zh: >
          在帧循环中把数字滚向目标值。
          
      en: >
          Animate digits toward the target on a frame loop.
          
  - protocol: rpc
    path: "bootPctRender(n, instant)"
    description:
      zh: >
          用位移渲染百/十/个三位数字。
          
      en: >
          Render hundred/tens/units digits by translate offset.
          
---
