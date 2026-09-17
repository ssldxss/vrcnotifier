---
uid: 27a3ce55
id: vrcnotifier.web
parent: vrcnotifier
name: {zh: "Web 前端面板", en: "Web Panel"}
description:
  zh: >
      你在浏览器里看到的面板。
      
  en: >
      The panel you see in the browser.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.933Z"
fingerprint: fd6f9f2531be0c603222c79d09d75f7265058dcf28ef4a0a941e11422c82ce94
source:
  - path: "public/app.js"
  - path: "public/index.html"
  - path: "public/app.css"
  - path: "public/sdk.js"
  - path: "public/logview.js"
  - path: "public/vrclinks.js"
deps:
  - kind: call
    to: vrcnotifier.web.shell
    label: {zh: "页面骨架", en: "Page shell"}
  - kind: call
    to: vrcnotifier.web.app
    label: {zh: "面板应用", en: "Panel application"}
---
