---
uid: 16ba80e4
id: vrcnotifier.web.app.api-client
parent: vrcnotifier.web.app
name: {zh: "请求封装与视图切换", en: "Request Helper & View Switching"}
description:
  zh: >
      所有功能共用的唯一请求入口。它带上 Bearer 令牌，并按报文把 401 分成两种：未登录类会让用户回到登录页但不打断事件流；其余 401 会停止事件流并弹出连接门禁，因为令牌本身不对。视图切换同时决定何时停止日志轮询，确保没有定时器活得比它的屏幕更久。
      
  en: >
      The single request helper every feature goes through. It attaches the Bearer token, and treats 401 as two different things depending on the message: a not-logged-in response drops the user to the login view without disturbing the event stream, while any other 401 stops the stream and shows the connection gate because the token itself is wrong. Switching views also decides when the log view should stop polling, so no timer outlives its screen.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:34:23.743Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 85
    end_line: 136
  - path: "public/app.js"
    line: 328
    end_line: 341
apis:
  - protocol: rpc
    path: "api(method, path, body, opts)"
    description:
      zh: >
          发起接口调用，并区分会话过期与后端不可达。
          
      en: >
          Issue an API call, distinguishing an expired session from a dead backend.
          
  - protocol: rpc
    path: "showView(name)"
    description:
      zh: >
          在连接门禁/登录/主界面三个视图间切换。
          
      en: >
          Switch between the gate, login and main views.
          
  - protocol: rpc
    path: "escapeHtml(v)"
    description:
      zh: >
          转义文本以便安全插入 HTML。
          
      en: >
          Escape text for safe HTML interpolation.
          
deps:
  - kind: call
    to: vrcnotifier.web.sdk
    label: {zh: "复用 SDK 客户端", en: "Reuse the SDK client"}
---
