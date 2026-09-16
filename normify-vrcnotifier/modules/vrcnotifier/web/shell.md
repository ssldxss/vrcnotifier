---
uid: b51dd879
id: vrcnotifier.web.shell
parent: vrcnotifier.web
name: {zh: "页面骨架与主题样式", en: "Page Shell & Theme"}
description:
  zh: >
      其他一切挂载其上的静态骨架：三个顶层视图（连接门禁、登录、主界面）、两个主页签、五个浮层，以及承载设计令牌、本地字体与两套主题的样式表。除一段在首帧前应用已存主题的内联脚本外没有逻辑，而正是这段脚本避免了主题闪烁。
      
  en: >
      The static shell everything else mounts into: the three top-level views (connection gate, login, main), the two main tabs, the five overlays, and the stylesheet that carries the design tokens, the locally hosted fonts and both themes. It contains no logic beyond one inline snippet that applies the stored theme before first paint, which is what prevents a flash of the wrong theme.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:32:30.745Z"
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
