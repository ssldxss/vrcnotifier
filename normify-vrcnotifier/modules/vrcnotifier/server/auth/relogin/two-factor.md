---
uid: 09f52694
id: vrcnotifier.server.auth.relogin.two-factor
parent: vrcnotifier.server.auth.relogin
name: {zh: "重登验证码与 QQ 指令", en: "Re-login 2FA & QQ Command"}
description:
  zh: >
      重登的验证侧：运行中会话被挂起时建立待验证会话（从响应体或 401 错误体中取可用验证方式），提供网页弹窗与 QQ 指令钩子共用的验证码校验，并可在保留密码的前提下清除 cookie 以重新触发验证码邮件（不消耗频控额度）。
      
  en: >
      The verification half of re-login: builds a pending session when a running session is suspended (reading the accepted factors from either the payload or the 401 body), verifies codes with a path shared by the web modal and the QQ command hook, and can resend the mail code by clearing cookies while keeping the saved password (without consuming the rate limit).
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:44.403Z"
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
          校验待验证验证码并落地会话。
          
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
    label: {zh: "校验待验证码", en: "Verify the pending code"}
  - kind: call
    to: vrcnotifier.server.auth.session
    label: {zh: "成功则落地", en: "Finalize on success"}
  - kind: call
    to: vrcnotifier.qq.notifier
    label: {zh: "经 QQ 回复", en: "Reply over QQ"}
---
