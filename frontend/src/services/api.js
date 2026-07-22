import axios from 'axios';

// 创建Axios实例
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8081', // 更新为正确的后端端口
  headers: {
    'Content-Type': 'application/json',
  },
});

// 配置响应拦截器
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

// chat 走与 game 共用的 TurnGraph：跳过 Director、直接指定 targetActorId 应答。
// 返回 TurnResponse（含 timeline_delta）。前端按 kind=speak 渲染对话气泡。
export const sendChatMessage = async ({ conversationId, targetActorId, content }) => {
  const token = localStorage.getItem('accessToken');
  const response = await api.post(
    `/api/conversations/${conversationId}/chat`,
    { targetActorId, content },
    {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    },
  );
  return response.data;
};

// 流式：后端 chat 路径暂未提供 SSE；降级为非流式，单段回调。
export const sendStreamMessage = (
  { conversationId, targetActorId, content },
  onChunk,
  onDone,
  onError,
) => {
  sendChatMessage({ conversationId, targetActorId, content })
    .then((data) => {
      const replyEntry = (data.timeline_delta || []).find(
        (e) => e.actor_id === targetActorId && e.speak,
      );
      if (replyEntry) {
        onChunk(replyEntry.speak, data.conversationId);
      }
      onDone();
    })
    .catch((err) => {
      onError(err);
    });
};

// 获取可用角色列表（未登录返回内置，已登录返回内置+自定义）
export const getRoles = async () => {
  const response = await api.get('/api/roles');
  return response.data;
};

// 创建自定义角色（需登录）
export const createRole = async (payload) => {
  const response = await api.post('/api/roles/my', payload);
  return response.data;
};

// 更新自定义角色（需登录）
export const updateRole = async (roleId, payload) => {
  const response = await api.put(`/api/roles/my/${roleId}`, payload);
  return response.data;
};

// 删除自定义角色（需登录）
export const deleteRole = async (roleId) => {
  await api.delete(`/api/roles/my/${roleId}`);
};

// 上传角色头像（需登录，仅自定义角色）
export const uploadRoleAvatar = async (roleId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(`/api/roles/${roleId}/avatar`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

// 请求角色语音（返回音频 Blob）
export const requestTTS = async (text, assistantRole, speakerId = null) => {
  const response = await api.post(
    '/api/tts',
    {
      text,
      assistantRole,
      speakerId,
    },
    {
      responseType: 'blob',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data;
};

// 会话相关 API
export const listConversations = async () => {
  const response = await api.get('/api/conversations');
  return response.data;
};

export const getConversationMessages = async (conversationId) => {
  // 终态：messages 表已删，统一走 timeline。前端按 kind=speak 过滤渲染对话。
  const response = await api.get(`/api/conversations/${conversationId}/timeline`);
  return response.data;
};

export const deleteConversationApi = async (conversationId) => {
  await api.delete(`/api/conversations/${conversationId}`);
};

export const renameConversationApi = async (conversationId, title) => {
  const response = await api.post(`/api/conversations/${conversationId}/rename`, { title });
  return response.data;
};

// Conversation 即世界：每条 conversation 自带 world_state / timeline / actor_minds。
// 没有"纯聊天 vs 游戏会话"的二分；chat 与 /actions 共用同一份 conversation。

// 创建或加载 conversation（首次创建时同步播种 NPC 心智 + 开场旁白）。
export const ensureConversation = async ({ conversationId = null, title = null } = {}) => {
  const response = await api.post('/api/conversations', { conversationId, title });
  return response.data;
};

// 获取 conversation 的世界状态视图。
export const getConversationWorld = async (conversationId) => {
  const response = await api.get(`/api/conversations/${conversationId}/world`);
  return response.data;
};

// 拉取 conversation 的统一时间线（chat speak / game act / scene）。
export const getConversationTimeline = async (conversationId, { afterId = null, limit = null } = {}) => {
  const params = {};
  if (afterId != null) params.after_id = afterId;
  if (limit != null) params.limit = limit;
  const response = await api.get(`/api/conversations/${conversationId}/timeline`, { params });
  return response.data;
};

// 玩家动作（game 模式入口）：经 TurnGraph 走完 director → fan_out_npcs → commit。
export const sendPlayerAction = async (conversationId, payload) => {
  const response = await api.post(`/api/conversations/${conversationId}/actions`, payload);
  return response.data;
};

// 切换会话级扮演角色：更新 player_actor_id 并就地翻转实体 kind（不重建世界）。
// actorId 为注册表 slug。返回 ConversationWorldRead。
export const setPlayedRole = async (conversationId, actorId) => {
  const token = localStorage.getItem('accessToken');
  const response = await api.post(
    `/api/conversations/${conversationId}/played-role`,
    { actorId },
    {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    },
  );
  return response.data;
};

// 认证相关 API
export const login = async (email, password) => {
  const response = await api.post('/api/auth/login', { email, password });
  return response.data;
};

export const register = async (email, password, username) => {
  const response = await api.post('/api/auth/register', { email, password, username });
  return response.data;
};

export const getCurrentUser = async () => {
  const response = await api.get('/api/auth/me');
  return response.data;
};

export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

export default api;

