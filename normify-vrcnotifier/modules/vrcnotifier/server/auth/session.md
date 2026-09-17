---
uid: 646ecb3e
id: vrcnotifier.server.auth.session
parent: vrcnotifier.server.auth
name: {zh: "会话建立与登出", en: "Session Finalization & Lifecycle"}
description:
  zh: >
      登录成功后统一在这里收尾：记住账号、保存登录信息、开始监控。
      
  en: >
      The single place a successful login lands: remember the account, save the credentials, start monitoring.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.676Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
source:
  - path: "src/server.js"
    line: 172
    end_line: 236
  - path: "src/server.js"
    line: 793
    end_line: 853
apis:
  - protocol: rpc
    path: "finalizeLogin(vrcapi, currentUser, opts)"
    description:
      zh: >
          四种登录入口共用的会话建立。
          
      en: >
          Shared landing path for every login entry point.
          
  - protocol: rpc
    path: "handleSessionExpired(userId)"
    description:
      zh: >
          会话失效时丢弃当前会话。
          
      en: >
          Drop the current session when it expires.
          
  - protocol: http
    method: POST
    path: "/api/logout"
    description:
      zh: >
          登出并清账号数据，可选清缓存与设置。
          
      en: >
          Log out and clear account data, optionally caches and settings.
          
  - protocol: http
    method: GET
    path: "/api/session"
    description:
      zh: >
          会话探测，未登录时触发自动登录。
          
      en: >
          Session probe that triggers auto-login when logged out.
          
  - protocol: http
    method: GET
    path: "/api/me"
    description:
      zh: >
          返回当前用户。
          
      en: >
          Return the current user.
          
deps:
  - kind: call
    to: vrcnotifier.data.users
    label: {zh: "保存账号与凭据", en: "Persist account and creds"}
  - kind: call
    to: vrcnotifier.monitor.session
    label: {zh: "启动监控", en: "Activate monitoring"}
  - kind: call
    to: vrcnotifier.data.purge
    label: {zh: "清账号数据", en: "Clear account data"}
  - kind: call
    to: vrcnotifier.infra.avatar.maintenance
    label: {zh: "清空头像缓存", en: "Clear the avatar cache"}
---
