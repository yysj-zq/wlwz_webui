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

// 发送聊天消息（普通方式）
export const sendChatMessage = async (messages, userRole, assistantRole, conversationId = null) => {
  try {
    const response = await api.post('/api/chat', {
      messages,
      userRole,
      assistantRole,
      conversationId,
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 发送聊天消息（流式响应）
export const sendStreamMessage = (messages, userRole, assistantRole, conversationId = null, onChunk, onDone, onError) => {
  const fetchSSE = async () => {
    try {
      // 使用fetch发送POST请求
      const token = localStorage.getItem('accessToken');
      const response = await fetch((process.env.REACT_APP_API_URL || 'http://localhost:8081') + '/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages,
          userRole,
          assistantRole,
          conversationId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const readChunk = async () => {
        const { done, value } = await reader.read();

        if (done) {
          onDone();
          return;
        }

        buffer += decoder.decode(value, { stream: true });

        // 处理SSE格式数据
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const normalizedLine = line.trim();
          if (normalizedLine.startsWith('data:')) {
            try {
              const data = JSON.parse(normalizedLine.substring(5).trim());
              if (data.error) {
                onError(new Error(data.error));
                reader.cancel();
                return;
              }
              if (data.content) {
                onChunk(data.content, data.conversationId);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          } else if (normalizedLine.startsWith('event: error')) {
            onError(new Error('流式响应异常'));
            reader.cancel();
            return;
          } else if (normalizedLine.startsWith('event: done')) {
            onDone();
            reader.cancel();
            return;
          }
        }

        readChunk();
      };

      readChunk().catch(onError);
    } catch (error) {
      onError(error);
      throw error;
    }
  };

  fetchSSE();
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
  const response = await api.get(`/api/conversations/${conversationId}/messages`);
  return response.data;
};

export const deleteConversationApi = async (conversationId) => {
  await api.delete(`/api/conversations/${conversationId}`);
};

export const renameConversationApi = async (conversationId, title) => {
  const response = await api.post(`/api/conversations/${conversationId}/rename`, { title });
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

