---
uid: c05f86b5
id: vrcnotifier.vrc.status
parent: vrcnotifier.vrc
name: {zh: "VRChat 服务状态", en: "VRChat Service Status"}
description:
  zh: >
      仿 VRCX 上报 VRChat 自身的服务健康。它是惰性的——只有面板询问时才发请求——结果缓存一分钟，并发调用共享同一次在途请求。全部正常映射为 normal，次要问题为 degraded，重大或严重为 outage；异常时额外拉取组件汇总，让面板能展示受影响的具体部分。刷新失败则沿用上次成功值并标记 stale。
      
  en: >
      Reports VRChat's own service health the way VRCX does. It is lazy — the request only happens when the panel asks — and the result is cached for a minute, with concurrent calls sharing one in-flight request. All-systems-operational maps to normal, minor to degraded and major or critical to outage; when something is wrong it additionally pulls the component summary so the panel can show which parts are affected. A failed refresh keeps the last good value marked stale.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:31:28.813Z"
fingerprint: a019a350767dacc7c04b88e0ea35383ccdc4fbd187398d599cc14b2762a69c01
source:
  - path: "src/vrcstatus.js"
    line: 1
    end_line: 104
apis:
  - protocol: rpc
    path: "status()"
    description:
      zh: >
          惰性获取官方服务状态并缓存。
      en: >
          Fetch the official status, lazily and cached.
---
