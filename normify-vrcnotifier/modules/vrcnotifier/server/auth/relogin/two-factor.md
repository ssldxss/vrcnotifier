---
uid: 09f52694
id: vrcnotifier.server.auth.relogin.two-factor
parent: vrcnotifier.server.auth.relogin
name: {zh: "重登验证码与 QQ 指令", en: "Re-login 2FA & QQ Command"}
description:
  zh: >
      接收重新登录需要的验证码——在网页弹窗里填，或在 QQ 里直接发。
      
  en: >
      Takes the code needed to finish a re-login, either typed into the panel or sent over QQ.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.676Z"
fingerprint: 8a87152c03841290a81ad1338ccae903301779179e5b623509869b3328eec77d
source:
  - path: "src/server.js"
    line: 477
    end_line: 559
  - path: "src/server.js"
    line: 779
    end_line: 791
apis:
  - protocol: rpc
    path: "startUnauthorized2fa(userId)"
    description:
      zh: >
          为挂起的运行中会话建立待验证 2FA 会话。
          
      en: >
          Start a 2FA pending session for an unauthorized running session.
          
  - protocol: rpc
    path: "verifyPendingCode(userId, code)"
    description:
      zh: >
          验证待验证的验证码，成功后建立会话。
          
      en: >
          Verify a pending code and finalize the session.
          
  - protocol: rpc
    path: "resendRelogin2fa(userId)"
    description:
      zh: >
          清 cookie 保密码，重新触发验证码邮件。
          
      en: >
          Clear cookies but keep the password to re-trigger the code mail.
          
  - protocol: rpc
    path: "handleAuthCommand(dbId, content)"
    description:
      zh: >
          解析重发验证码与 4/6 位验证码的 QQ 钩子。
          
      en: >
          QQ hook parsing resend-code and 4/6-digit OTP messages.
          
  - protocol: http
    method: POST
    path: "/api/relogin/2fa"
    description:
      zh: >
          从网页弹窗提交重登 2FA 验证码。
          
      en: >
          Submit the pending re-login 2FA code from the web modal.
          
deps:
  - kind: call
    to: vrcnotifier.vrc.api.auth
    label: {zh: "验证待验证码", en: "Verify the pending code"}
  - kind: call
    to: vrcnotifier.server.auth.session
    label: {zh: "成功后建会话", en: "Finalize on success"}
  - kind: call
    to: vrcnotifier.qq.notifier
    label: {zh: "经 QQ 回复", en: "Reply over QQ"}
---
