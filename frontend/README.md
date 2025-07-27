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
cd frontend
npm install
```

### 启动开发服务器

```bash
npm start
```

应用将在 [http://localhost:3000](http://localhost:3000) 启动。


## 如何配置

### 后端API配置

创建 `.env` 文件，设置API地址：

```
REACT_APP_API_URL=http://your-backend-api-url
```
## 向后端发送的消息格式

```
{
  "messages": [
    {
      "role": "郭芙蓉",
      "content": "掌柜的，给我涨工钱了该"
    },
    {
      "role": "佟湘玉",
      "content": "你涨什么工钱呀？"
    },
    {
      "role": "郭芙蓉",
      "content": "我干了十年了不得涨点工钱？"
    },
    {
      "role": "佟湘玉",
      "content": "那小郭，你不要动不动就拿这事儿跟我磨蹭，要涨工钱可以，你得自己去跟客人商量，你要是不跟客人商量，那我也没辙。"
    },
    {
      "role": "邢育森",
      "content": "掌柜的，你说啥呢？你该给人涨工钱就得涨"
    }
  ],
  "userRole": "邢育森",
  "assistantRole": "佟湘玉"
}
```
userRole和assistantRole是本轮对话双方角色
## 自定义角色

若要修改可用的角色列表，请编辑 `src/components/RoleSelector.js` 文件中的角色信息。


## 许可证

MIT
