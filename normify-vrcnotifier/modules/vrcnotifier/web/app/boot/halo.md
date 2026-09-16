---
uid: f6a0044c
id: vrcnotifier.web.app.boot.halo
parent: vrcnotifier.web.app.boot
name: {zh: "启动光环动画", en: "Boot Halo Animation"}
description:
  zh: >
      每个进行中的行带一圈呼吸光环，而收尾比移除一个 CSS 类要讲究：先读回正在播放的动画当前 transform，再在短时长内收到 scale(1)并用 forwards 保持，使光环从它真实所在的位置平滑停下而不是硬跳。句柄按行保存，使重置总能清掉残留。
      
  en: >
      Each pending row carries a breathing halo, and finishing it is subtler than removing a CSS class: the running animation is read back as its current transform and then settled to scale one over a short duration with forwards fill, so the halo eases to a stop from wherever it actually was instead of snapping. Handles are kept per row so a reset can always clear leftovers.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:32:30.745Z"
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
