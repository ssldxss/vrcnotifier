---
uid: b94b5920
id: vrcnotifier.infra.crypto
parent: vrcnotifier.infra
name: {zh: "数据加密", en: "Data Encryption"}
description:
  zh: >
      给敏感数据加密；钥匙可以来自环境变量或 Docker 密钥文件。
  en: >
      Encrypts sensitive data; the key can come from an environment variable or a Docker secret file.
revision: 2c5024302d3ef7a2eed227ff1c099afb401d6bcd
updated_at: "2026-09-16T15:19:17.770Z"
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
