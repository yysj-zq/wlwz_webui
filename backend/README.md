# 角色扮演对话后端 API

这个项目是一个基于 FastAPI 构建的后端服务，用于提供角色扮演对话的 API 接口，支持普通对话和流式对话。

## 功能特点

- 提供标准的 REST API 接口
- 支持流式响应，适用于打字机效果展示
- 支持用户角色和 AI 助手角色的自定义
- 易于与大模型 API 集成
- 可配置的环境设置

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
python main.py
```

服务将在 http://localhost:8081 上运行。

## API 文档

启动服务后，可以访问自动生成的 API 文档：

- Swagger UI: http://localhost:8081/docs
- ReDoc: http://localhost:8081/redoc

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

### 修改编排逻辑

services/chat_service.py

### 修改系统提示词

在 `utils/prompt.py` 中修改模板内容。


## 许可证

[MIT License](LICENSE)

## 免责声明

本项目使用了《武林外传》相关元素，仅用于技术演示和学习交流。详细信息请参阅[免责声明](../DISCLAIMER.md)。
