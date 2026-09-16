---
uid: b94b5920
id: vrcnotifier.infra.crypto
parent: vrcnotifier.infra
name: {zh: "数据加密", en: "Data Encryption"}
description:
  zh: >
      AES-256-GCM，每个值用随机 IV，并把附加认证数据绑定到字段与行身份，因此从某行取出的密文无法被重放到另一行。版本前缀让旧明文直通，并让密钥不符或密文损坏可被检出：它们解密为 null 而不是乱码。密钥解析优先取 Docker Secret 挂载，其次环境变量，都没有时报告未启用加密。
      
  en: >
      AES-256-GCM with a random IV per value and additional authenticated data bound to the field and row identity, so a ciphertext lifted from one row cannot be replayed into another. The version prefix lets legacy plaintext pass through and makes wrong-key or corrupted values detectable: they decrypt to null rather than garbage. Key resolution prefers the Docker secret mount, then an environment variable, otherwise it reports encryption off.
      
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T14:32:30.745Z"
fingerprint: 2b4fcd3f009ec0862a89d04614a2639dcc9a983d5193dbb63593c9c335e76469
source:
  - path: "src/crypto.js"
    line: 1
    end_line: 79
apis:
  - protocol: rpc
    path: "createCrypto({masterKey})"
    description:
      zh: >
          用 32 字节主密钥构造加解密器。
      en: >
          Build an encryptor/decryptor from a 32-byte master key.
  - protocol: rpc
    path: "resolveMasterKey({secretFile, envKey, devNoEncrypt})"
    description:
      zh: >
          按优先级解析密钥与模式：Docker Secret、环境变量或不加密。
      en: >
          Resolve the key and mode by priority: Docker secret, env var, or none.
  - protocol: rpc
    path: "decodeKey(text)"
    description:
      zh: >
          解码 64 位 hex 或 32 字节 base64 密钥。
      en: >
          Decode a 64-hex or 32-byte base64 key.
  - protocol: file
    path: "/run/secrets/vrcnotifier_master_key"
    description:
      zh: >
          从 Docker Secret 挂载点读取主密钥。
      en: >
          Read the master key from the Docker secret mount.
---
