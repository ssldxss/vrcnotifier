# 施工中

## 项目的qq机器人为主要测试/开发的通知方法,其他方法不保证无问题  
qqbot真的很好用啊

&nbsp;

项目初步可用,还在打磨,有很多奇奇怪怪的问题  
启动&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;后端&nbsp;&nbsp;&nbsp;npm start&nbsp;&nbsp;&nbsp;前端&nbsp;&nbsp;npm run frontend  
默认监听&nbsp;&nbsp;&nbsp;后端&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3000&nbsp;&nbsp;&nbsp;&nbsp;前端&nbsp;&nbsp;&nbsp;8080&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;  
token在后端日志  
配置完后后端可完全独立运行(在绑定qqbot后,包括debug推送,查看在线好友列表)

灵感来自shanyaojinjn/VRC-Notifier  
使用websocket代替api轮询&nbsp;&nbsp;&nbsp;解析notifier-v2消息&nbsp;&nbsp;&nbsp;没任何数据加密&nbsp;&nbsp;&nbsp;其他没什么区别(功能上)  
本来想直接改shanyaojinjn/VRC-Notifier,改不动已经废了(ssldxss/VRC-Notifier的websocket分支)  

node.js 24.x

<img width="1254" height="1254" alt="psc" src="https://github.com/user-attachments/assets/43077f4e-4fc1-4b8d-bd18-499edef84a52" />
