---
uid: "032e8940"
id: vrcnotifier.app.lifecycle.startup
parent: vrcnotifier.app.lifecycle
name: {zh: "启动自检与密钥检查", en: "Boot Self-check & Key Validation"}
description:
  zh: >
      开机自检：找到加密钥匙；如果钥匙已经打不开旧数据，就清空重来。
      
  en: >
      Start-up checks: find the encryption key, and if it no longer matches the saved data, wipe and start over.
      
revision: 6515ec0b18c3caed3cb0014a183ac3d34d011dd8
updated_at: "2026-09-16T15:22:26.689Z"
fingerprint: f25564c89baf4114b3baf36c945152cf491a94287d92e6f2350aba5bd057df88
source:
  - path: "src/index.js"
    line: 274
    end_line: 320
apis:
  - protocol: rpc
    path: "startupResolveKey(opts)"
    description:
      zh: >
          按优先级解析主密钥与加密模式。
          
      en: >
          Resolve the master key and encryption mode by priority.
          
  - protocol: rpc
    path: "startupSelfCheck(db, crypt, logger)"
    description:
      zh: >
          解密自检，失败则清库并退出重启。
          
      en: >
          Decryptability self-check; wipe and restart on failure.
          
deps:
  - kind: call
    to: vrcnotifier.infra.crypto
    label: {zh: "解析主密钥", en: "Resolve the master key"}
  - kind: call
    to: vrcnotifier.data.crypto-fields
    label: {zh: "探测密文可解性", en: "Probe stored ciphertext"}
---
