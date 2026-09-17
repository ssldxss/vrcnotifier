---
uid: 0f23bb1e
id: vrcnotifier.web.app.dropdown
parent: vrcnotifier.web.app
name: {zh: "下拉框与筛选", en: "Dropdowns & Filters"}
description:
  zh: >
      把系统自带的下拉框换成好看一点的，并记住你选的筛选条件。
      
  en: >
      Replaces the plain dropdowns with nicer ones, and remembers the filters you picked.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:58:27.921Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 2159
    end_line: 2306
apis:
  - protocol: rpc
    path: "makeDropdown(sel, opts)"
    description:
      zh: >
          把原生 select 升级为带键盘导航的玻璃拟态菜单。
          
      en: >
          Upgrade a native select into a glass menu with keyboard navigation.
          
  - protocol: rpc
    path: "saveLogFilter()"
    description:
      zh: >
          持久化日志筛选选择。
          
      en: >
          Persist the log filter selection.
          
---
