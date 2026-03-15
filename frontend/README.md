# 武林外传 AI 对话前端应用

React 单页应用，角色扮演聊天界面，支持多会话、流式回复与 TTS 播放。

## 功能概览

- **角色扮演**：选择用户角色与 AI 角色进行对话，角色列表由后端 API 提供
- **多轮对话**：连续对话，消息列表与流式打字机效果
- **会话管理**：创建、切换、删除会话，会话与登录用户关联
- **TTS 播放**：对单条消息请求语音并播放
- **明暗主题**：明亮 / 暗黑模式
- **响应式**：适配桌面与移动端

## 快速启动

```bash
npm install
npm start
```

应用默认在 **http://localhost:3000** 运行。

## 配置

在本目录创建 `.env`，指定后端地址：

```
REACT_APP_API_URL=http://localhost:8081
```

未配置时，请求会发往当前域名（同源）。

## 项目结构

```
frontend/
├── public/
├── src/
│   ├── components/      # UI 组件
│   │   ├── Chat.js          # 聊天区域与消息列表
│   │   ├── Header.js        # 顶栏、会话与设置
│   │   ├── RoleSelector.js  # 角色选择
│   │   └── RolesConfig.js   # 角色/配置相关
│   ├── services/
│   │   └── api.js       # 后端 API 封装（聊天、会话、角色、TTS、认证）
│   ├── App.js           # 根组件与全局状态
│   └── index.js         # 入口
└── package.json
```

## 技术栈

- React 18、Create React App
- Material UI（MUI）
- Axios、react-markdown
- 本地状态 + localStorage 持久化部分设置

与后端的交互（登录态、会话、消息格式等）均通过 `src/services/api.js` 完成，角色列表来自后端 `/api/roles`。