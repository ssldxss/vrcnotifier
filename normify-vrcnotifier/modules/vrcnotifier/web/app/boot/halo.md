---
uid: f6a0044c
id: vrcnotifier.web.app.boot.halo
parent: vrcnotifier.web.app.boot
name: {zh: "光环动画", en: "Halo Animation"}
description:
  zh: >
      每行旁边转圈的光环；这一步完成时会平滑地收住。
  en: >
      The spinning halo beside each line, which eases to a stop when that step finishes.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:19:37.674Z"
fingerprint: 06609d43725c1483a940506f664ec39835212c390e7767362f17ac852efcc15d
source:
  - path: "public/app.js"
    line: 805
    end_line: 859
apis:
  - protocol: rpc
    path: "bootHalo(i, mode)"
    description:
      zh: >
          运行呼吸光环或让它收到停止。
          
      en: >
          Run the breathing halo or settle it to a stop.
          
  - protocol: rpc
    path: "bootHalosReset()"
    description:
      zh: >
          清理残留的光环动画。
          
      en: >
          Clear any leftover halo animations.
          
---
