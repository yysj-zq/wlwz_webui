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
export const sendChatMessage = async (messages, userRole, assistantRole) => {
  try {
    const response = await api.post('/api/chat', {
      messages,
      userRole,
      assistantRole,
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 发送聊天消息（流式响应）
export const sendStreamMessage = (messages, userRole, assistantRole, onChunk, onDone, onError) => {
  const fetchSSE = async () => {
    try {
      // 使用fetch发送POST请求
      const response = await fetch(process.env.REACT_APP_API_URL+'/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          userRole,
          assistantRole,
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
          if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.substring(5).trim());
              if (data.content) {
                onChunk(data.content);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          } else if (line.startsWith('event: done')) {
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

// 获取可用角色列表
export const getRoles = async () => {
  try {
    const response = await api.get('/api/roles');
    return response.data;
  } catch (error) {
    throw error;
  }
};

export default api;

