---
uid: d7142507
id: vrcnotifier.web.app.login
parent: vrcnotifier.web.app
name: {zh: "登录、2FA 与登出", en: "Login, 2FA & Logout"}
description:
  zh: >
      登录、输验证码、退出，以及会话过期时重新验证。
  en: >
      Signing in, entering codes, logging out, and re-verifying when a session expires.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:19:37.674Z"
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
    label: {zh: "提交凭据", en: "Submit credentials"}
  - kind: call
    to: vrcnotifier.web.app.boot.state-machine
    label: {zh: "驱动等待页", en: "Drive the boot overlay"}
  - kind: call
    to: vrcnotifier.web.app.roster
    label: {zh: "加载好友列表", en: "Load the roster"}
---
