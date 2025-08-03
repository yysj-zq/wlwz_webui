# 武林外传AI对话

一个基于FastAPI后端和React前端的角色扮演AI聊天网站。

## 功能特点

- 🎭 **角色扮演对话**: 支持用户和AI助手角色自定义
- 💬 **多轮对话**: 支持连续多轮对话
- ⚡ **流式输出**: 支持AI回复的实时流式显示
- 🌓 **明暗主题**: 支持切换明亮和暗黑模式
- 📱 **响应式设计**: 适配桌面和移动设备

## 技术栈

- **后端**: FastAPI, Python
- **前端**: React, Material UI
- **特性**: 流式响应, 会话管理, 本地存储

## 快速开始

### 后端启动

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# 配置 .env 文件
python main.py
```

服务将在 http://localhost:8081 上运行。

### 前端启动

```bash
cd frontend
npm install
npm start
```

应用将在 http://localhost:3000 上运行。

## 项目结构

```
.
├── backend/          # 后端服务
│   ├── routers/      # API路由
│   ├── services/     # 业务逻辑
│   ├── utils/        # 工具函数
│   └── ...
└── frontend/         # 前端应用
    ├── src/
    │   ├── components/  # UI组件
    │   └── services/    # API服务
    └── ...
```
## TODO

- [ ] 对话场景嵌入message
- [x] 【UI】对话头像设置


## 许可证

[MIT License](LICENSE)
