---
uid: 646ecb3e
id: vrcnotifier.server.auth.session
parent: vrcnotifier.server.auth
name: {zh: "会话落地与登出", en: "Session Finalization & Lifecycle"}
description:
  zh: >
      密码登录、登录 2FA、自动重登与挂起重验证四种入口共用的唯一会话落地点：重置退避状态、停用旧会话、换账号时清掉他人数据、写入用户行、按记住我保存或清除 cookie/密码（cookie 回写做 2 秒防抖）并启动监控。同时负责会话探测、当前用户读取与登出（登出必清账号数据，可选清缓存与设置）。
      
  en: >
      The single session landing path used by password login, login 2FA, auto-relogin and unauthorized-2FA: resets backoff state, deactivates the previous session, clears foreign account data on account switch, upserts the user, persists or clears cookies/password for remember-me (with a 2-second debounced cookie writer) and starts monitoring. Also owns the session probe, current-user read and logout (which always clears account data and optionally caches and settings).
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:36:27.989Z"
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
          四种登录入口共用的会话落地。
          
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
    from_api: "rpc:finalizeLogin(vrcapi, currentUser, opts)"
    to_api: "rpc:upsertUser(vrcId, fields)"
    label: {zh: "保存账号与凭据", en: "Persist account and creds"}
  - kind: call
    to: vrcnotifier.monitor.session
    from_api: "rpc:finalizeLogin(vrcapi, currentUser, opts)"
    to_api: "rpc:activateUser(user, vrcapi)"
    label: {zh: "启动监控", en: "Activate monitoring"}
  - kind: call
    to: vrcnotifier.data.purge
    from_api: "POST /api/logout"
    to_api: "rpc:clearAccountData()"
    label: {zh: "清账号数据", en: "Clear account data"}
  - kind: call
    to: vrcnotifier.infra.avatar.maintenance
    from_api: "POST /api/logout"
    to_api: "rpc:clear()"
    label: {zh: "清空头像缓存", en: "Clear the avatar cache"}
---
