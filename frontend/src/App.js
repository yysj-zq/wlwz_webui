import React, { useState, useEffect, useRef } from 'react';
import { Box, CssBaseline, useMediaQuery, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Typography, Drawer, Tabs, Tab } from '@mui/material';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTheme } from './contexts/ThemeContext';
import Header from './components/Header';
import ChatPage from './pages/ChatPage';
import SettingsPage from './pages/SettingsPage';
import RolesPage from './pages/RolesPage';
import { v4 as uuidv4 } from 'uuid';
import { sendChatMessage, sendStreamMessage, requestTTS, login, register, getCurrentUser, setAuthToken, listConversations, getConversationMessages, deleteConversationApi, renameConversationApi, getRoles } from './services/api';

function App() {
  const { theme } = useTheme();
  const location = useLocation();
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
  const [currentUser, setCurrentUser] = useState(null);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [rolesConfig, setRolesConfig] = useState(null);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [controlCenterOpen, setControlCenterOpen] = useState(false);
  const [controlCenterTab, setControlCenterTab] = useState(() => localStorage.getItem('controlCenterTab') || 'settings');

  const loadRoles = () => {
    getRoles()
      .then((data) => setRolesConfig(data))
      .catch((e) => console.error('Load roles error', e));
  };

  useEffect(() => {
    loadRoles();
  }, []);

  useEffect(() => {
    // 初始化 token 与当前用户
    const savedToken = localStorage.getItem('accessToken');
    if (savedToken) {
      setAuthToken(savedToken);
      getCurrentUser()
        .then(async (user) => {
          setCurrentUser(user);
          loadRoles();
          try {
            const backendConvs = await listConversations();
            const mapped = backendConvs.map(c => ({
              id: uuidv4(),
              backendConversationId: c.id,
              title: c.title,
              messages: [],
              createdAt: c.created_at,
            }));
            setConversations(mapped);
            setCurrentConversationId(mapped[0]?.id || null);
          } catch (e) {
            console.error('Load conversations error', e);
          }
        })
        .catch(() => {
          localStorage.removeItem('accessToken');
          setAuthToken(null);
          setCurrentUser(null);
          loadRoles();
        });
    }
  }, []);

  useEffect(() => {
    if (!currentUser) {
      localStorage.setItem('conversations', JSON.stringify(conversations));
    }
  }, [conversations, currentUser]);

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
    localStorage.setItem('controlCenterTab', controlCenterTab);
  }, [controlCenterTab]);

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
        title: sceneInput ? sceneInput.substring(0, 30) + (sceneInput.length > 30 ? '…' : '') : '新的对话',
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
    const conv = conversations.find(c => c.id === id);
    if (currentUser && conv && conv.backendConversationId && (!conv.messages || conv.messages.length === 0)) {
      getConversationMessages(conv.backendConversationId)
        .then(msgs => {
          const uiMessages = msgs.map(m => ({
            id: uuidv4(),
            role: m.role,
            content: m.content,
            timestamp: m.created_at,
          }));
          setConversations(prev =>
            prev.map(c =>
              c.id === id ? { ...c, messages: uiMessages } : c
            )
          );
        })
        .catch(e => console.error('Load messages error', e));
    }
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleDeleteConversation = (id) => {
    const conv = conversations.find(c => c.id === id);
    if (currentUser && conv && conv.backendConversationId) {
      deleteConversationApi(conv.backendConversationId)
        .catch(e => console.error('Delete conversation error', e));
    }
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

    const speakerId = rolesConfig?.assistantVoiceMap?.[assistantRole] ?? null;
    try {
      const audioBlob = await requestTTS(text, assistantRole, speakerId || null);
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
    const target = conversations.find(conv => conv.id === id);
    if (currentUser && target && target.backendConversationId) {
      renameConversationApi(target.backendConversationId, newTitle)
        .catch(e => console.error('Rename conversation error', e));
    }
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
          updatedTitle = message.substring(0, 30) + (message.length > 30 ? '…' : '');
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
        currentConv.backendConversationId || null,
        (chunk, conversationIdFromServer) => {
          // 收到数据块时回调
          responseContent += chunk;
          console.log('got'+chunk);
          updateAssistantMessage(lastMessageId, responseContent, false);
          if (conversationIdFromServer && !currentConv.backendConversationId) {
            setConversations(prev =>
              prev.map(conv =>
                conv.id === currentConversationId
                  ? { ...conv, backendConversationId: conversationIdFromServer }
                  : conv
              )
            );
          }
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
      sendChatMessage(apiMessages, userRole, assistantRole, currentConv.backendConversationId || null)
        .then(response => {
          if (response.conversationId && !currentConv.backendConversationId) {
            setConversations(prev =>
              prev.map(conv =>
                conv.id === currentConversationId
                  ? { ...conv, backendConversationId: response.conversationId }
                  : conv
              )
            );
          }
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

  const isChatPage = location.pathname === '/';

  const openControlCenter = (tab) => {
    if (tab) {
      setControlCenterTab(tab);
    }
    setControlCenterOpen(true);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: theme.palette.background.default }}>
      <CssBaseline />
      <a href="#main-content" className="skip-link">
        跳到主内容
      </a>
      <Header
        onSidebarToggle={isChatPage ? handleSidebarToggle : undefined}
        onNewChat={isChatPage ? handleCreateNewChat : undefined}
        onOpenControlCenter={openControlCenter}
      />
      <Box component="main" id="main-content" sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Routes>
          <Route
            path="/"
            element={
              <ChatPage
                sidebarOpen={sidebarOpen}
                isMobile={isMobile}
                conversations={conversations}
                currentConversationId={currentConversationId}
                onSelectConversation={handleSelectConversation}
                onNewChat={handleCreateNewChat}
                onDeleteConversation={handleDeleteConversation}
                onUpdateTitle={handleUpdateConversationTitle}
                conversation={currentConversation}
                onSendMessage={handleSendMessage}
                onPlayMessageAudio={handlePlayMessageAudio}
                onRetryMessageAudio={handleRetryMessageAudio}
                userRole={userRole}
                assistantRole={assistantRole}
                setUserRole={setUserRole}
                setAssistantRole={setAssistantRole}
                rolesConfig={rolesConfig}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Box>

      <Drawer
        anchor="right"
        open={controlCenterOpen}
        onClose={() => setControlCenterOpen(false)}
        sx={{ zIndex: (muiTheme) => muiTheme.zIndex.drawer + 3 }}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 520 },
            borderLeft: `1px solid ${theme.palette.divider}`,
            backgroundColor: theme.palette.background.default,
            '@keyframes controlCenterIn': {
              from: { opacity: 0, transform: 'translateX(12px)' },
              to: { opacity: 1, transform: 'translateX(0)' },
            },
            animation: 'controlCenterIn 220ms ease-out',
          },
        }}
      >
        <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box>
              <Typography variant="overline" sx={{ opacity: 0.75, letterSpacing: 1.1 }}>
                Control Center
              </Typography>
              <Typography variant="h6">控制中心</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              按 Esc 关闭
            </Typography>
          </Box>
          <Tabs
            value={controlCenterTab}
            onChange={(_, value) => setControlCenterTab(value)}
            sx={{ mt: 1 }}
          >
            <Tab value="settings" label="偏好设置" />
            <Tab value="roles" label="角色配置" />
          </Tabs>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {controlCenterTab === 'settings' ? (
            <SettingsPage
              embedded
              currentUser={currentUser}
              onLoginClick={() => {
                setAuthError('');
                setAuthDialogOpen(true);
              }}
              onLogout={() => {
                localStorage.removeItem('accessToken');
                setAuthToken(null);
                setCurrentUser(null);
              }}
              userRole={userRole}
              setUserRole={setUserRole}
              assistantRole={assistantRole}
              setAssistantRole={setAssistantRole}
              streamingEnabled={streamingEnabled}
              setStreamingEnabled={setStreamingEnabled}
              rolesConfig={rolesConfig}
            />
          ) : (
            <RolesPage
              embedded
              rolesConfig={rolesConfig}
              currentUser={currentUser}
              onSaved={loadRoles}
            />
          )}
        </Box>
      </Drawer>

      {/* 场景输入对话框 */}
      <Dialog
        open={sceneDialogOpen}
        onClose={handleSceneCancel}
        fullWidth
        maxWidth="md"
        PaperProps={{
          sx: {
            width: { xs: 'calc(100% - 24px)', sm: 760 },
            maxWidth: 760,
            borderRadius: 3,
            border: `1px solid ${theme.palette.divider}`,
            background: theme.palette.mode === 'light'
              ? 'linear-gradient(180deg, rgba(255, 252, 245, 0.96), rgba(248, 241, 228, 0.98))'
              : 'linear-gradient(180deg, rgba(61, 47, 25, 0.96), rgba(45, 34, 19, 0.98))',
            boxShadow: theme.palette.mode === 'light'
              ? '0 14px 44px rgba(88,57,34,0.2)'
              : '0 14px 44px rgba(0,0,0,0.45)',
          },
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="overline" sx={{ opacity: 0.75, letterSpacing: 1.1 }}>
            Scene Setup
          </Typography>
          <Typography variant="h6">设置场景</Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            autoFocus
            margin="dense"
            type="text"
            fullWidth
            variant="outlined"
            name="scene-description"
            inputProps={{ 'aria-label': '场景描述输入框' }}
            value={sceneInput}
            onChange={(e) => setSceneInput(e.target.value)}
            multiline
            rows={5}
            placeholder="请输入场景描述，例如：【大堂，昼】（老白趴在桌上睡觉，小郭在擦桌子）…"
            autoComplete="off"
            sx={{
              mt: 0.5,
              '& .MuiOutlinedInput-root': {
                backgroundColor: theme.palette.mode === 'light' ? 'rgba(255,255,255,0.68)' : 'rgba(255,255,255,0.06)',
              },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5 }}>
          <Button
            onClick={handleSceneCancel}
            sx={{
              borderRadius: 999,
              px: 2,
            }}
          >
            取消
          </Button>
          <Button
            onClick={handleSceneSubmit}
            variant="contained"
            color="primary"
            sx={{
              borderRadius: 999,
              px: 2.5,
            }}
          >
            确认
          </Button>
        </DialogActions>
      </Dialog>

      {/* 登录/注册对话框 */}
      <Dialog
        open={authDialogOpen}
        onClose={() => {
          if (!authLoading) {
            setAuthError('');
            setAuthDialogOpen(false);
          }
        }}
      >
        <DialogTitle>{authMode === 'login' ? '登录' : '注册'}</DialogTitle>
        <DialogContent>
          <Typography role="status" aria-live="polite" color="error" variant="body2" sx={{ minHeight: 24 }}>
            {authError}
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label="邮箱"
            type="email"
            fullWidth
            variant="outlined"
            name="email"
            autoComplete="email"
            inputProps={{ inputMode: 'email', spellCheck: false }}
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
          />
          <TextField
            margin="dense"
            label="密码"
            type="password"
            fullWidth
            variant="outlined"
            name="password"
            autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAuthDialogOpen(false)} disabled={authLoading}>
            取消
          </Button>
          <Button
            onClick={() => {
              setAuthError('');
              setAuthMode(authMode === 'login' ? 'register' : 'login');
            }}
            disabled={authLoading}
          >
            {authMode === 'login' ? '去注册' : '去登录'}
          </Button>
          <Button
            onClick={async () => {
              setAuthError('');
              setAuthLoading(true);
              try {
                if (authMode === 'login') {
                  const tokenResp = await login(authEmail, authPassword);
                  localStorage.setItem('accessToken', tokenResp.access_token);
                  setAuthToken(tokenResp.access_token);
                  const user = await getCurrentUser();
                  setCurrentUser(user);
                  loadRoles();
                  const backendConvs = await listConversations();
                  const mapped = backendConvs.map(c => ({
                    id: uuidv4(),
                    backendConversationId: c.id,
                    title: c.title,
                    messages: [],
                    createdAt: c.created_at,
                  }));
                  setConversations(mapped);
                  setCurrentConversationId(mapped[0]?.id || null);
                } else {
                  await register(authEmail, authPassword, null);
                }
                setAuthDialogOpen(false);
              } catch (e) {
                console.error('Auth error', e);
                setAuthError(authMode === 'login' ? '登录失败，请检查邮箱和密码后重试。' : '注册失败，请稍后重试。');
              } finally {
                setAuthLoading(false);
              }
            }}
            disabled={authLoading}
          >
            {authLoading ? (authMode === 'login' ? '登录中…' : '注册中…') : (authMode === 'login' ? '登录' : '注册')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default App;
