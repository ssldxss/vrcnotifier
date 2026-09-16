---
uid: "032e8940"
id: vrcnotifier.app.lifecycle.startup
parent: vrcnotifier.app.lifecycle
name: {zh: "启动自检与密钥校验", en: "Boot Self-check & Key Validation"}
description:
  zh: >
      打开数据库前解析主密钥（Docker Secret → MASTER_KEY → --no-encrypt），随后用当前密钥探测敏感密文是否可解：不可解则清空除访问令牌外的全部数据、删除头像缓存并以退出码 0 结束，交给容器策略重启。
      
  en: >
      Resolves the master key (Docker Secret, then MASTER_KEY, then --no-encrypt) before opening the database, then probes whether existing sensitive ciphertext decrypts with it: if not, it wipes everything except the access token, removes the avatar cache and exits with code 0 so the container policy restarts it.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:33:19.896Z"
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
