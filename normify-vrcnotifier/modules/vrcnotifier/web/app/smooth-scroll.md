---
uid: f8da1d3d
id: vrcnotifier.web.app.smooth-scroll
parent: vrcnotifier.web.app
name: {zh: "惯性平滑滚动", en: "Inertial Smooth Scrolling"}
description:
  zh: >
      用惯性曲线替换浏览器默认滚轮滚动，使可能承载上千行的日志面板不会每滚一格就一顿。它还把这套缓动暴露为程序化滚动目标，使回到顶部与页签跳转的观感与手动滚动一致，而不是另一套内置动画。
      
  en: >
      Replaces the browser's default wheel scrolling with an inertial curve so the log panel, which can hold thousands of rows, does not jerk on every wheel notch. It also exposes the same easing as a programmatic scroll target so back-to-top and tab jumps move with the same feel as manual scrolling instead of a different built-in animation.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:32:30.746Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 2308
    end_line: 2349
apis:
  - protocol: rpc
    path: "initSmoothScroll()"
    description:
      zh: >
          用指数趋近的惯性滚动替换默认滚轮。
      en: >
          Replace default wheel scrolling with exponential inertial easing.
  - protocol: rpc
    path: "__smoothScrollTo(target)"
    description:
      zh: >
          供回到顶部与页签跳转使用的程序化平滑滚动。
      en: >
          Programmatic smooth scroll used by back-to-top and tab jumps.
---
