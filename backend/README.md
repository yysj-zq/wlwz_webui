# 角色扮演对话后端 API

这个项目是一个基于 FastAPI 构建的后端服务，用于提供角色扮演对话的 API 接口，支持普通对话和流式对话。

## 功能特点

- 提供标准的 REST API 接口
- 支持流式响应，适用于打字机效果展示
- 支持用户角色和 AI 助手角色的自定义
- 易于与大模型 API 集成
- 可配置的环境设置

## 项目结构

```
backend/
│
├── main.py                 # 应用入口点
├── config.py               # 配置管理
├── requirements.txt        # 依赖列表
├── .env.example            # 环境变量示例
│
├── routers/                # 路由模块
│   ├── __init__.py
│   ├── chat_router.py      # 聊天相关接口
│   └── roles_router.py     # 角色相关接口
│
├── services/               # 业务逻辑服务
│   ├── __init__.py
│   ├── chat_service.py     # 聊天服务逻辑
│   ├── roles_service.py    # 角色服务逻辑
│   └── models.py           # 数据模型定义
│
└── utils/                  # 工具函数
    ├── __init__.py
    └── model_client.py     # 大模型 API 客户端
```

### 组件职责说明

- **路由层 (routers/)**: 处理 HTTP 请求和响应，参数验证，路由分发
- **服务层 (services/)**:
  - `models.py`: 定义数据结构和验证规则
  - `chat_service.py`: 实现对话业务逻辑，调用底层 API 客户端
  - `roles_service.py`: 实现角色管理业务逻辑
- **工具层 (utils/)**:
  - `model_client.py`: 封装与大模型 API 的通信细节，处理请求/响应格式转换


## 快速开始

### 1. 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

### 2. 配置环境变量

复制环境变量示例文件并根据需要修改：

```bash
cp .env.example .env
```

打开 `.env` 文件并根据实际情况配置以下变量：

- `DEBUG`: 设置是否启用调试模式 (True/False)
- `CORS_ORIGINS`: 允许的跨域请求来源，多个域名用逗号分隔
- `MODEL_BASE_URL`: 大模型 API 的基础 URL
- `MODEL_API_KEY`: 大模型 API 的访问密钥
- `STREAM_DELAY`: 流式响应的延迟设置（秒）

### 3. 启动服务

```bash
uvicorn main:app --reload
```

服务将在 http://localhost:8000 上运行。

## API 文档

启动服务后，可以访问自动生成的 API 文档：

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## API 端点说明

### 1. 普通对话请求

- **URL**: `/api/chat`
- **方法**: POST
- **请求体**:
```json
{
  "messages": [
    {"role": "user", "content": "你好"},
    {"role": "assistant", "content": "有什么可以帮助你的吗？"}
  ],
  "userRole": "学生",
  "assistantRole": "学习导师"
}
```
- **响应示例**:
```json
{
  "response": "作为学习导师，我很高兴能帮助你。你有什么学习上的问题吗？"
}
```

### 2. 流式对话请求

- **URL**: `/api/chat/stream`
- **方法**: POST
- **请求体**: 与普通请求相同
- **响应**: 使用 Server-Sent Events (SSE) 流式返回文本块

### 3. 获取可用角色列表

- **URL**: `/api/roles`
- **方法**: GET
- **响应示例**:
```json
{
  "userRoles": ["普通用户", "学生", "教师", "医生", "工程师"],
  "assistantRoles": ["通用助手", "学习导师", "职业顾问", "健康顾问"]
}
```

## 自定义配置说明

### 修改默认角色列表

编辑 `services/roles_service.py` 文件中的 `DEFAULT_USER_ROLES` 和 `DEFAULT_ASSISTANT_ROLES` 变量。

### 集成不同的大模型 API

修改 `utils/model_client.py` 中的 `call_model_api` 函数，根据目标 API 的要求调整请求格式和处理逻辑。

### 修改系统提示词

在 `utils/model_client.py` 中找到构建系统提示词的部分，根据需要修改模板内容。

## 常见问题

1. **服务无法启动**
   - 检查依赖是否正确安装
   - 确认端口 8000 是否被占用

2. **CORS 错误**
   - 在 `.env` 文件中正确设置 `CORS_ORIGINS` 变量，包含前端域名

3. **大模型 API 调用失败**
   - 检查 `MODEL_BASE_URL` 和 `MODEL_API_KEY` 是否正确配置
   - 查看服务日志以获取详细错误信息

## 许可证

[MIT License](LICENSE)
