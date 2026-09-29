'use strict';
// 跨模块共享的可变状态。放成一个文件是为了让"谁在读写全局状态"一目了然。
// mutating 用法不变: 各模块直接赋值/读取这些顶层 let(传统脚本共享同一个全局词法环境)。

let currentUser = null;
let tempSessionId = null;
let twofaKind = 'emailOtp';
let friendsCache = [];
let searchQuery = ''; // 好友搜索关键词
let myInfo = null; // 当前用户信息(页面标题栏展示, 与好友行共用渲染)
let currentView = 'gate';        // 当前视图(断开弹窗只在非门禁页弹出)
let backendOnline = true;        // 后端连接状态(心跳维护)
let connModalCooldownUntil = 0;  // 取消断开弹窗后的冷却截止时间
let connTimer = null;
