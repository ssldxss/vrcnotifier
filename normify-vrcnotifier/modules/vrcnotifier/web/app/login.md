---
uid: d7142507
id: vrcnotifier.web.app.login
parent: vrcnotifier.web.app
name: {zh: "登录、2FA 与登出", en: "Login, 2FA & Logout"}
description:
  zh: >
      登录面及其后续。表单把密码错误、限流与需要邮箱验证三种情况用不同文案区分，2FA 挑战则原地换成验证码表单。登出是带两个独立勾选项的弹窗——清缓存与清设置，因为两者含义差别很大；账号数据始终在服务端清除。重登弹窗复用同一条验证码路径，使挂起的会话无需完整登录即可恢复。
      
  en: >
      The login surface and its aftermath. The form distinguishes password failure, rate limiting and the email-verification case with distinct messages, and a 2FA challenge swaps the form in place. Logout is a modal with two independent opt-ins, clearing caches and clearing settings, because they mean very different things; account data is always cleared server-side. A re-login modal reuses the same code path to revive a suspended session.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:27.989Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 439
    end_line: 604
apis:
  - protocol: rpc
    path: "checkSession()"
    description:
      zh: >
          探测会话，仍登录则进入主界面。
          
      en: >
          Probe the session, entering the main view when still logged in.
          
  - protocol: rpc
    path: "submitLogin()"
    description:
      zh: >
          提交凭据，遇到挑战时切到 2FA 表单。
          
      en: >
          Submit credentials, switching to the 2FA form when challenged.
          
  - protocol: rpc
    path: "submitTwoFactor()"
    description:
      zh: >
          提交 2FA 验证码。
          
      en: >
          Submit the 2FA code.
          
  - protocol: rpc
    path: "submitLogout(opts)"
    description:
      zh: >
          登出，可选清缓存与设置。
          
      en: >
          Log out, optionally clearing caches and settings.
          
  - protocol: rpc
    path: "enterMain(opts)"
    description:
      zh: >
          进入主界面并开始加载数据。
          
      en: >
          Enter the main view and kick off data loading.
          
deps:
  - kind: call
    to: vrcnotifier.web.app.api-client
    from_api: "rpc:submitLogin()"
    to_api: "rpc:api(method, path, body, opts)"
    label: {zh: "提交凭据", en: "Submit credentials"}
  - kind: call
    to: vrcnotifier.web.app.boot.state-machine
    from_api: "rpc:submitLogin()"
    to_api: "rpc:bootShow()"
    label: {zh: "驱动等待页", en: "Drive the boot overlay"}
  - kind: call
    to: vrcnotifier.web.app.roster
    from_api: "rpc:enterMain(opts)"
    to_api: "rpc:loadFriends()"
    label: {zh: "加载好友列表", en: "Load the roster"}
---
