---
uid: bc246dba
id: vrcnotifier.web.app.shell.overview
parent: vrcnotifier.web.app.shell
name: {zh: "概览卡片与回到顶部", en: "Overview Cards & Back to Top"}
description:
  zh: >
      概览条的行为：点击卡片会让该项闪一下，使点击即使没改变底层数值也有可见后果；回到顶部按钮在滚动超过阈值时出现和消失，而不是一动就冒出来。这些细节之所以重要，多半是因为一旦缺失，界面就会被感受为“没反应”。
      
  en: >
      The overview strip's behaviour: clicking a card flashes that item so the click has a visible consequence even when the underlying value is unchanged, and the back-to-top button appears and disappears around a scroll threshold rather than at the very first pixel. These are small things that mostly matter because their absence is felt as the interface being unresponsive.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
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
          超过滚动阈值时显示回到顶部按钮。
          
      en: >
          Reveal the back-to-top button past a scroll threshold.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.status
    label: {zh: "读取状态值", en: "Read status values"}
---
