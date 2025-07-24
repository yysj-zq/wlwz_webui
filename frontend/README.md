# 角色扮演AI聊天界面

这是一个现代化的角色扮演AI聊天前端项目，可以与OpenAI类型的大模型API进行角色扮演对话。界面美观、功能齐全，支持多轮对话、会话管理和流式输出。

## 功能特点

- 🎭 **角色扮演**: 支持选择用户角色和AI角色进行对话
- 💬 **多轮对话**: 支持与AI进行连续多轮对话
- 📝 **会话管理**: 创建、编辑、删除和切换多个会话
- ⚡ **流式输出**: 支持AI回复的实时流式显示
- 🌓 **明暗主题**: 支持切换明亮和暗黑模式
- 📱 **响应式设计**: 适配桌面和移动设备

## 技术栈

- **React**: 用于构建用户界面
- **Material UI**: 现代化UI组件库
- **Markdown渲染**: 支持AI回复中的富文本和代码高亮
- **LocalStorage**: 本地保存会话历史和设置

## 开始使用

### 安装依赖

```bash
cd project/wlwz/webui_2
npm install
```

### 启动开发服务器

```bash
npm start
```

应用将在 [http://localhost:3000](http://localhost:3000) 启动。

### 构建生产版本

```bash
npm run build
```

生成的文件将位于 `build` 目录，可以部署到任何静态网站托管服务。

## 如何配置

### 后端API配置

在 `.env` 文件中设置API地址（如果文件不存在，请创建）：

```
REACT_APP_API_URL=http://your-backend-api-url
```

默认API地址为 `http://localhost:8000`。

### 后端API要求

后端API需要提供以下端点：

1. `/api/chat` - 用于普通对话请求
   - 请求方法: POST
   - 请求体: 
     ```json
     {
       "messages": [消息历史数组],
       "userRole": "用户角色",
       "assistantRole": "AI角色"
     }
     ```

2. `/api/chat/stream` - 用于流式对话请求
   - 请求方法: POST
   - 请求体: 与普通请求相同
   - 响应: 以流的形式返回文本块

3. `/api/roles` (可选) - 获取可用角色列表
   - 请求方法: GET
   - 响应:
     ```json
     {
       "userRoles": ["角色1", "角色2", ...],
       "assistantRoles": ["角色1", "角色2", ...]
     }
     ```

## 自定义角色

若要修改可用的角色列表，请编辑 `src/components/Header.js` 文件中的 `userRoles` 和 `assistantRoles` 数组。

## 部署指南

1. 构建项目: `npm run build`
2. 将 `build` 目录中的文件部署到网站服务器
3. 确保服务器正确配置以处理单页应用路由（将所有请求重定向到 index.html）

### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/build;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## 常见问题解答

**Q: 如何更改默认角色?**  
A: 在 `src/App.js` 中修改 `userRole` 和 `assistantRole` 的默认值。

**Q: 如何禁用流式输出?**  
A: 在设置中关闭"启用流式输出"选项，或在 `src/App.js` 中将 `streamingEnabled` 的默认值设为 `false`。

**Q: 我的对话历史保存在哪里?**  
A: 对话历史保存在浏览器的 LocalStorage 中。清除浏览器数据将删除所有历史记录。

**Q: 如何增加更多AI模型?**  
A: 此前端设计不支持模型选择，而是使用角色选择。如需添加模型选择功能，需要修改代码结构。

## 许可证

MIT
