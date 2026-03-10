import React, { useState, useEffect, useRef } from 'react';
import { Box, CssBaseline, useMediaQuery, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button } from '@mui/material';
import { useTheme } from './contexts/ThemeContext';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Chat from './components/Chat';
import { v4 as uuidv4 } from 'uuid';
import { sendChatMessage, sendStreamMessage, requestTTS } from './services/api';

function App() {
  const { theme } = useTheme();
  const isMobile = useMediaQuery('(max-width:900px)');
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [conversations, setConversations] = useState(() => {
    const saved = localStorage.getItem('conversations');
    return saved ? JSON.parse(saved) : [{
      id: uuidv4(),
      title: '新的对话',
      messages: [],
      createdAt: new Date().toISOString(),
    }];
  });
  const [currentConversationId, setCurrentConversationId] = useState(() => {
    const saved = localStorage.getItem('currentConversationId');
    return saved || (conversations[0] && conversations[0].id);
  });
  const [userRole, setUserRole] = useState(() => {
    const saved = localStorage.getItem('userRole');
    return saved || '佟湘玉';
  });
  const [assistantRole, setAssistantRole] = useState(() => {
    const saved = localStorage.getItem('assistantRole');
    return saved || '白展堂';
  });
  const [streamingEnabled, setStreamingEnabled] = useState(() => {
    const saved = localStorage.getItem('streamingEnabled');
    return saved ? JSON.parse(saved) : true;
  });
  const [sceneDialogOpen, setSceneDialogOpen] = useState(false);
  const [sceneInput, setSceneInput] = useState('');
  const [shouldCreateNewChat, setShouldCreateNewChat] = useState(false);
  const audioPlayerRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('conversations', JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    localStorage.setItem('currentConversationId', currentConversationId);
  }, [currentConversationId]);

  useEffect(() => {
    localStorage.setItem('userRole', userRole);
  }, [userRole]);

  useEffect(() => {
    localStorage.setItem('assistantRole', assistantRole);
  }, [assistantRole]);

  useEffect(() => {
    localStorage.setItem('streamingEnabled', JSON.stringify(streamingEnabled));
  }, [streamingEnabled]);

  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, []);

  const handleSidebarToggle = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const currentConversation = conversations.find(conv => conv.id === currentConversationId) || conversations[0];

  const handleCreateNewChat = () => {
    setShouldCreateNewChat(true);
    setSceneDialogOpen(true);
  };

  const handleSceneSubmit = () => {
    if (shouldCreateNewChat) {
      const newConversation = {
        id: uuidv4(),
        title: sceneInput ? sceneInput.substring(0, 30) + (sceneInput.length > 30 ? '...' : '') : '新的对话',
        messages: sceneInput ? [{ 
          id: uuidv4(),
          role: 'scene',
          content: `${sceneInput}`,
          timestamp: new Date().toISOString(),
        }] : [],
        createdAt: new Date().toISOString(),
      };
      setConversations([...conversations, newConversation]);
      setCurrentConversationId(newConversation.id);
    }
    setSceneDialogOpen(false);
    setSceneInput('');
    setShouldCreateNewChat(false);
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleSceneCancel = () => {
    setSceneDialogOpen(false);
    setSceneInput('');
    setShouldCreateNewChat(false);
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleSelectConversation = (id) => {
    setCurrentConversationId(id);
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleDeleteConversation = (id) => {
    const newConversations = conversations.filter(conv => conv.id !== id);
    setConversations(newConversations);
    if (id === currentConversationId) {
      setCurrentConversationId(newConversations[0]?.id || null);
    }
  };

  const stopCurrentAudio = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current = null;
    }
  };

  const updateMessageAudioMeta = (messageId, patch) => {
    setConversations(prevConversations =>
      prevConversations.map(conv => {
        if (conv.id === currentConversationId) {
          return {
            ...conv,
            messages: conv.messages.map(msg =>
              msg.id === messageId ? { ...msg, ...patch } : msg
            )
          };
        }
        return conv;
      })
    );
  };

  const autoplayMessageAudio = async (messageId, text) => {
    if (!text || !text.trim()) {
      return;
    }

    updateMessageAudioMeta(messageId, {
      audioLoading: true,
      audioError: '',
    });

    try {
      const audioBlob = await requestTTS(text, assistantRole);
      const audioUrl = URL.createObjectURL(audioBlob);

      updateMessageAudioMeta(messageId, {
        audioUrl,
        audioLoading: false,
        audioError: '',
      });

      stopCurrentAudio();
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;
      await audio.play();
    } catch (error) {
      console.error('TTS Error:', error);
      updateMessageAudioMeta(messageId, {
        audioLoading: false,
        audioError: '语音生成失败，请稍后重试。',
      });
    }
  };

  const handlePlayMessageAudio = async (messageId) => {
    const currentConv = conversations.find(conv => conv.id === currentConversationId);
    const message = currentConv?.messages?.find(msg => msg.id === messageId);

    if (!message?.audioUrl) {
      return;
    }

    try {
      stopCurrentAudio();
      const audio = new Audio(message.audioUrl);
      audioPlayerRef.current = audio;
      await audio.play();
    } catch (error) {
      console.error('Audio Play Error:', error);
      updateMessageAudioMeta(messageId, {
        audioError: '音频播放失败，请重试。',
      });
    }
  };

  const handleRetryMessageAudio = async (messageId) => {
    const currentConv = conversations.find(conv => conv.id === currentConversationId);
    const message = currentConv?.messages?.find(msg => msg.id === messageId);

    if (!message?.content || message.loading) {
      return;
    }

    await autoplayMessageAudio(messageId, message.content);
  };

  const handleUpdateConversationTitle = (id, newTitle) => {
    setConversations(conversations.map(conv =>
      conv.id === id ? { ...conv, title: newTitle } : conv
    ));
  };

  const sanitizeAssistantContent = (rawContent) => {
    if (!rawContent || typeof rawContent !== 'string') {
      return rawContent;
    }

    let cleaned = rawContent;
    // 移除完整 think 块（包含中间内容），而不是只去掉标签本身
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
    // 去掉开头可能残留的角色前缀
    cleaned = cleaned.replace(new RegExp(`^\\s*${assistantRole}：\\s*`), '');
    // 折叠多余空行
    cleaned = cleaned.replace(/^\s+/, '').replace(/\n{3,}/g, '\n\n');

    return cleaned.trim();
  };

  const handleSendMessage = (message) => {
    // 找到当前对话
    const updatedConversations = conversations.map(conv => {
      if (conv.id === currentConversationId) {
        // 添加新的用户消息
        const userMessage = {
          id: uuidv4(),
          role: userRole,
          content: message,
          timestamp: new Date().toISOString(),
        };

        // 创建空的助手消息(将在实际API响应后更新)
        const assistantMessage = {
          id: uuidv4(),
          role: assistantRole,
          content: '', // 初始为空，将通过流式响应或一次性响应填充
          timestamp: new Date().toISOString(),
          loading: true,
        };

        // 如果是第一条消息，更新标题
        let updatedTitle = conv.title;
        if (conv.messages.length === 0) {
          updatedTitle = message.substring(0, 30) + (message.length > 30 ? '...' : '');
        }

        return {
          ...conv,
          title: updatedTitle,
          messages: [...conv.messages, userMessage, assistantMessage],
        };
      }
      return conv;
    });

    setConversations(updatedConversations);

    // 准备API调用所需的消息格式
    const currentConv = updatedConversations.find(conv => conv.id === currentConversationId);
    const lastMessageId = currentConv.messages[currentConv.messages.length - 1].id;

    // 准备发送到API的消息数组，去掉UI相关字段
    const apiMessages = currentConv.messages
      .filter(msg => msg.id !== lastMessageId) // 排除刚刚添加的空助手消息
      .map(msg => ({
        role: msg.role,
        content: msg.content
      }));

    console.log(apiMessages);
    // 根据是否启用流式响应选择合适的API调用方法
    if (streamingEnabled) {
      // 使用流式API
      let responseContent = '';

      sendStreamMessage(
        apiMessages,
        userRole,
        assistantRole,
        (chunk) => {
          // 收到数据块时回调
          responseContent += chunk;
          console.log('got'+chunk);
          updateAssistantMessage(lastMessageId, responseContent, false);
        },
        () => {
          // 完成时回调
          updateAssistantMessage(lastMessageId, responseContent, true);
        },
        (error) => {
          // 错误时回调
          console.error('Stream API Error:', error);
          updateAssistantMessage(lastMessageId, '抱歉，发生了错误，请稍后再试。', true);
        }
      );
    } else {
      // 使用普通API（非流式）
      sendChatMessage(apiMessages, userRole, assistantRole)
        .then(response => {
          updateAssistantMessage(lastMessageId, response.content || '抱歉，没有收到有效回复。', true);
        })
        .catch(error => {
          console.error('Chat API Error:', error);
          updateAssistantMessage(lastMessageId, '抱歉，发生了错误，请稍后再试。', true);
        });
    }
  };

  // 更新助手消息
  const updateAssistantMessage = (messageId, content, done) => {
    let processedContent = content;
    if (content && typeof content === 'string' && done) {
      // 仅在消息完成时进行最终清洗，避免流式阶段闪烁
      processedContent = sanitizeAssistantContent(content);
    }

    setConversations(prevConversations =>
      prevConversations.map(conv => {
        if (conv.id === currentConversationId) {
          return {
            ...conv,
            messages: conv.messages.map(msg =>
              msg.id === messageId ? { ...msg, content: processedContent, loading: !done } : msg
            )
          };
        }
        return conv;
      })
    );

    if (done && processedContent) {
      autoplayMessageAudio(messageId, processedContent);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: theme.palette.background.default }}>
      <CssBaseline />
      <Header
        onSidebarToggle={handleSidebarToggle}
        onNewChat={handleCreateNewChat}
        userRole={userRole}
        setUserRole={setUserRole}
        assistantRole={assistantRole}
        setAssistantRole={setAssistantRole}
        streamingEnabled={streamingEnabled}
        setStreamingEnabled={setStreamingEnabled}
      />
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {sidebarOpen || isMobile ? (
          <Sidebar
            open={sidebarOpen}
            conversations={conversations}
            currentConversationId={currentConversationId}
            onSelectConversation={handleSelectConversation}
            onNewChat={handleCreateNewChat}
            onDeleteConversation={handleDeleteConversation}
            onUpdateTitle={handleUpdateConversationTitle}
            isMobile={isMobile}
          />
        ) : null}
        <Chat
          conversation={currentConversation}
          onSendMessage={handleSendMessage}
          onPlayMessageAudio={handlePlayMessageAudio}
          onRetryMessageAudio={handleRetryMessageAudio}
          userRole={userRole}
          assistantRole={assistantRole}
          setUserRole={setUserRole}
          sidebarOpen={sidebarOpen}
        />
      </Box>

      {/* 场景输入对话框 */}
      <Dialog open={sceneDialogOpen} onClose={handleSceneCancel}>
        <DialogTitle>设置场景</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            type="text"
            fullWidth
            variant="outlined"
            value={sceneInput}
            onChange={(e) => setSceneInput(e.target.value)}
            multiline
            rows={5}
            placeholder="请输入场景描述，例如：【大堂，昼】（老白趴在桌上睡觉，小郭在擦桌子）"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSceneCancel}>取消</Button>
          <Button onClick={handleSceneSubmit} variant="contained" color="primary">
            确认
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default App;
