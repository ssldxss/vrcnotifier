---
uid: a5c7e19b
id: vrcnotifier.infra.util.version
parent: vrcnotifier.infra.util
tags: [release, versioning]
name: {zh: "版本号", en: "Version Numbers"}
description:
  zh: >
      版本号的唯一决定处。约定 git tag 是唯一真相：发版流水线取形如 v<主>.<次>.<补丁> 的最高 tag 做 patch 自增（想提 minor 就自己打个 tag，之后继续自增），并把该版本作为 APP_VERSION 注入镜像，于是 /api/config 报的版本 == git tag == Docker tag。
      
  en: >
      The single place that decides version numbers. Git tags are the source of truth: the release workflow bumps the patch of the highest v<major>.<minor>.<patch> tag (bump minor by hand and auto-increment continues from there), and injects that version into the image as APP_VERSION, so the version reported by /api/config equals the git tag equals the Docker tag.
      
revision: 1e6d2c26d295da7875c40ecbd1ba3f855df96a4c
updated_at: "2026-09-17T13:59:42.575Z"
fingerprint: 138ddedacf8810be5c35405cb5cdc5adb13e2f804028ca2e01e02cc6da5f01a8
source:
  - path: "src/version.js"
apis:
  - protocol: rpc
    path: "nextVersion(tagNames, baseVersion)"
    description:
      zh: >
          从已有 tag 名算出下一个 patch 版本，非 v<数字>.<数字>.<数字> 形态的一律忽略。
          
      en: >
          Compute the next patch version from the existing tag names, ignoring anything that is not v<major>.<minor>.<patch>.
          
  - protocol: rpc
    path: "currentVersion(env)"
    description:
      zh: >
          本构建对外报的版本：镜像构建时注入的 APP_VERSION 优先，否则用 package.json。
          
      en: >
          The version this build reports: APP_VERSION when injected at image build time, otherwise package.json.
          
---
