---
uid: 30031ebc
id: vrcnotifier.web.app.shell.tabs
parent: vrcnotifier.web.app.shell
name: {zh: "页签导航", en: "Tab Navigation"}
description:
  zh: >
      页签切换保留了一个有意的不对称：用户点击时播放快速交叉淡入与卡片级联入场，而加载时恢复上次页签则静态渲染，避免每次刷新都对着用户放一遍动画。指示块只在容器可见时测量，因为测量隐藏元素会得到错误的位置。
      
  en: >
      Tab switching with an intentional asymmetry: a user click plays a quick cross-fade plus a staggered card entrance, while restoring the previous tab on load renders statically so the panel does not appear to animate at the user on every refresh. The indicator is only measured while the container is visible, because measuring a hidden element yields the wrong position.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 2007
    end_line: 2078
apis:
  - protocol: rpc
    path: "switchTab(name, opts)"
    description:
      zh: >
          切换页签，带卡片级联入场与滑动指示块。
          
      en: >
          Switch tabs with staggered card entrance and a sliding indicator.
          
  - protocol: rpc
    path: "moveTabIndicator()"
    description:
      zh: >
          定位页签指示块，仅在可见时测量。
          
      en: >
          Position the tab indicator, measuring only when visible.
          
  - protocol: rpc
    path: "saveLastTab(name)"
    description:
      zh: >
          持久化当前页签，使刷新后回到原处。
          
      en: >
          Persist the active tab so a reload returns to it.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.groups
    label: {zh: "展示好友页", en: "Show the roster page"}
---
