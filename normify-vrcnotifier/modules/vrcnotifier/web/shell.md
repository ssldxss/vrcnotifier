---
uid: b51dd879
id: vrcnotifier.web.shell
parent: vrcnotifier.web
name: {zh: "页面骨架与配色", en: "Page Skeleton & Colours"}
description:
  zh: >
      页面的骨架和配色，包括三个主要画面和几个弹窗。
      
  en: >
      The page skeleton and styling: the three main screens and the dialogs.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.934Z"
fingerprint: 013937bce15bc7fb04ff150819e6b707aa06780133628194f8d0b6aee44f1a11
source:
  - path: "public/index.html"
  - path: "public/app.css"
apis:
  - protocol: file
    path: "public/index.html"
    description:
      zh: >
          单页文档，含全部视图、弹窗与等待页。
          
      en: >
          The single page document, including all views, modals and the boot overlay.
          
  - protocol: file
    path: "public/app.css"
    description:
      zh: >
          完整样式表，含本地托管字体与两套主题。
          
      en: >
          The full stylesheet, including the locally hosted fonts and both themes.
          
  - protocol: http
    method: GET
    path: "/index.html"
    description:
      zh: >
          页面本体。
          
      en: >
          The page itself.
          
---
