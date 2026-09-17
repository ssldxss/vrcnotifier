---
uid: bc246dba
id: vrcnotifier.web.app.shell.overview
parent: vrcnotifier.web.app.shell
name: {zh: "概览条与回到顶部", en: "Overview & Back to Top"}
description:
  zh: >
      概览条的点击反馈，以及回到顶部按钮。
      
  en: >
      Click feedback on the overview strip, and the back-to-top button.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.926Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 2080
    end_line: 2135
apis:
  - protocol: rpc
    path: "flashOverviewItem(item)"
    description:
      zh: >
          在概览项上短暂高亮。
          
      en: >
          Show a transient highlight on an overview item.
          
  - protocol: rpc
    path: "updateToTop()"
    description:
      zh: >
          页面往下滚到一定位置时显示回到顶部按钮。
          
      en: >
          Reveal the back-to-top button past a scroll threshold.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.status
    label: {zh: "读取状态值", en: "Read status values"}
---
