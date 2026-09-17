---
uid: f8da1d3d
id: vrcnotifier.web.app.smooth-scroll
parent: vrcnotifier.web.app
name: {zh: "顺滑滚动", en: "Smooth Scrolling"}
description:
  zh: >
      让滚轮滚动更顺滑，不再一格一格地跳。
      
  en: >
      Makes wheel scrolling glide instead of jumping a notch at a time.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.927Z"
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
