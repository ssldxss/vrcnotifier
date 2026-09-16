---
uid: 299b192a
id: vrcnotifier.web.app.boot.percent-odometer
parent: vrcnotifier.web.app.boot
name: {zh: "百分比里程表", en: "Percentage Odometer"}
description:
  zh: >
      百分比由三条数字带构成的里程表实现，靠 transform 动画推进，并做节流以免数字带糊成一团，但始终强制精确落到目标值。两条规则让它保持诚实：数值只增不减；尚未收到真实进度时完全不显示数字，而不是编一个看着合理的数。
      
  en: >
      The percentage is an odometer built from three digit strips animated by transform, throttled so the strips stay legible instead of blurring, but always forced to land exactly on the target. Two rules keep it honest: the value never decreases, and when no real progress has arrived yet it displays no digit at all rather than inventing a plausible number.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:32:30.745Z"
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
