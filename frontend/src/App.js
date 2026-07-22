import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, CssBaseline, useMediaQuery, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Typography, Drawer, Tabs, Tab } from '@mui/material';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTheme } from './contexts/ThemeContext';
import Header from './components/Header';
import ChatPage from './pages/ChatPage';
import SettingsPage from './pages/SettingsPage';
import RolesPage from './pages/RolesPage';
import { v4 as uuidv4 } from 'uuid';
import { sendChatMessage, sendStreamMessage, requestTTS, login, register, getCurrentUser, setAuthToken, listConversations, getConversationMessages, deleteConversationApi, renameConversationApi, getRoles, ensureConversation, sendPlayerAction, setPlayedRole } from './services/api';
import { applyTimelineDelta } from './game/worldState'; // eslint-disable-line no-unused-vars

// 默认扮演的注册表 slug，须由后端 roles 提供；世界未就绪时作临时 fallback。
const PLAYER_ACTOR_ID = 'player';

function App() {
  const { theme } = useTheme();
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width:900px)');
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
  const [zenPinned, setZenPinned] = useState(false);
  const [leftPeek, setLeftPeek] = useState(false);
  const [sidebarPreviewActive, setSidebarPreviewActive] = useState(false);
  const [topbarCondensed, setTopbarCondensed] = useState(false);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('viewMode') || 'chat');
  const [conversationWorlds, setConversationWorlds] = useState({});
  // 游戏气泡按前端 conversation.id 隔离，避免切会话串台。
  const [gameDialogueByConv, setGameDialogueByConv] = useState({});
  const [gameLoading, setGameLoading] = useState(false);
  const currentConversationWorldStateRef = useRef(null);
  const currentConversationIdRef = useRef(null);
  const gameTTSInFlightRef = useRef(false);
  const leftEnterTimerRef = useRef(null);
  const leftLeaveTimerRef = useRef(null);
  const zenMode = zenPinned;
  const effectiveSidebarOpen = sidebarOpen || sidebarPreviewActive;

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
    localStorage.setItem('assistantRole', assistantRole);
  }, [assistantRole]);

  useEffect(() => {
    localStorage.setItem('streamingEnabled', JSON.stringify(streamingEnabled));
  }, [streamingEnabled]);

  useEffect(() => {
    localStorage.setItem('controlCenterTab', controlCenterTab);
  }, [controlCenterTab]);

  useEffect(() => {
    localStorage.setItem('viewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    return () => {
      if (leftEnterTimerRef.current) clearTimeout(leftEnterTimerRef.current);
      if (leftLeaveTimerRef.current) clearTimeout(leftLeaveTimerRef.current);
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (viewMode === 'game' && currentConversation) {
      ensureCurrentConversationWorld().catch((error) => {
        console.error('Ensure game session error', error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, currentConversationId]);

  const handleSidebarToggle = () => {
    setSidebarPreviewActive(false);
    setSidebarOpen(!sidebarOpen);
  };

  const activateZenMode = () => {
    setZenPinned(true);
  };

  const handleZenLeftEnter = () => {
    if (!zenPinned) return;
    if (leftLeaveTimerRef.current) clearTimeout(leftLeaveTimerRef.current);
    if (leftEnterTimerRef.current) clearTimeout(leftEnterTimerRef.current);
    leftEnterTimerRef.current = setTimeout(() => {
      setLeftPeek(true);
      if (!sidebarOpen) {
        setSidebarPreviewActive(true);
      }
    }, 90);
  };

  const handleZenLeftLeave = () => {
    if (!zenPinned) return;
    if (leftEnterTimerRef.current) clearTimeout(leftEnterTimerRef.current);
    if (leftLeaveTimerRef.current) clearTimeout(leftLeaveTimerRef.current);
    leftLeaveTimerRef.current = setTimeout(() => {
      setLeftPeek(false);
      setSidebarPreviewActive(false);
    }, 160);
  };

  const currentConversation = conversations.find(conv => conv.id === currentConversationId) || conversations[0];
  const currentConversationWorld = currentConversation ? conversationWorlds[currentConversation.id] : null;
  const currentConversationWorldState = currentConversationWorld?.world_state || null;
  const gameDialogueLines = currentConversation
    ? (gameDialogueByConv[currentConversation.id] || [])
    : [];

  // 渲染期同步，避免 ensure/hydrate 的 effect 早于 ref effect 跑时误判会话已切换。
  currentConversationIdRef.current = currentConversationId;

  useEffect(() => {
    currentConversationWorldStateRef.current = currentConversationWorldState;
  }, [currentConversationWorldState]);

  // 角色身份的唯一事实源：全部从后端 rolesConfig.roles 派生（slug ⇄ 显示名 ⇄ speaker）。
  // 找不到时降级：name→null、slug→原样、speaker→null；不伪造中文显示名。
  const nameToSlug = (name) => (
    rolesConfig?.roles?.find((r) => r.name === name)?.slug || null
  );
  const slugToName = (slug) => (
    rolesConfig?.roles?.find((r) => r.slug === slug)?.name || slug
  );
  const slugToSpeaker = (slug) => (
    rolesConfig?.roles?.find((r) => r.slug === slug)?.default_speaker_id || null
  );

  const getEntityName = (worldState, actorId) => (
    worldState?.entities?.[actorId]?.name || slugToName(actorId) || actorId || 'scene'
  );

  const timelineToUiMessages = (entries) => (
    (entries || [])
      .filter((m) => m.speak || (m.kind === 'scene' && m.narration))
      .map((m) => ({
        id: uuidv4(),
        role: m.kind === 'scene' ? 'scene' : slugToName(m.actor_id),
        content: m.kind === 'scene' ? (m.speak || m.narration) : m.speak,
        kind: m.kind === 'scene' ? 'narration' : (m.actor_id === PLAYER_ACTOR_ID ? 'player_action' : 'npc_line'),
        metadata_json: m,
        timestamp: m.created_at,
      }))
  );

  const timelineToGameSpeechLines = (entries) => (
    (entries || [])
      .filter((entry) => entry.speak && entry.actor_id)
      .map((entry) => ({
        actor_id: entry.actor_id,
        name: slugToName(entry.actor_id),
        text: entry.speak,
      }))
  );

  // 拉 timeline 填 chat messages（仅当该会话 messages 仍空）。
  const loadConversationMessagesIfEmpty = async (uiConversationId, backendConversationId) => {
    if (!uiConversationId || !backendConversationId) return;
    try {
      const entries = await getConversationMessages(backendConversationId);
      if (currentConversationIdRef.current !== uiConversationId) return;
      const uiMessages = timelineToUiMessages(entries);
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== uiConversationId) return c;
          if (c.messages?.length) return c;
          return { ...c, messages: uiMessages };
        })
      );
    } catch (error) {
      console.error('Load messages error', error);
    }
  };

  // 切到 chat 时若 messages 仍空，从 timeline 回填（不必先离开再点回会话列表）。
  // 等 rolesConfig 就绪后再拉，避免 role 写成拼音 slug。
  useEffect(() => {
    if (viewMode !== 'chat' || !currentUser || !currentConversation?.backendConversationId) return;
    if (!rolesConfig?.roles?.length) return;
    if (currentConversation.messages?.length) return;
    void loadConversationMessagesIfEmpty(
      currentConversation.id,
      currentConversation.backendConversationId,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, currentConversationId, currentUser, currentConversation?.backendConversationId, rolesConfig]);

  // roles 晚到时：把已加载消息/游戏台词里的 slug 翻成中文名。
  useEffect(() => {
    if (!rolesConfig?.roles?.length) return;
    setConversations((prev) => {
      let any = false;
      const next = prev.map((conv) => {
        if (!conv.messages?.length) return conv;
        let changed = false;
        const messages = conv.messages.map((m) => {
          if (m.role === 'scene' || !m.role) return m;
          const slug = m.metadata_json?.actor_id || m.role;
          const name = slugToName(slug);
          if (name === m.role) return m;
          changed = true;
          return { ...m, role: name };
        });
        if (!changed) return conv;
        any = true;
        return { ...conv, messages };
      });
      return any ? next : prev;
    });
    setGameDialogueByConv((prev) => {
      let any = false;
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        next[id] = (next[id] || []).map((line) => {
          const name = slugToName(line.actor_id);
          if (line.name === name) return line;
          any = true;
          return { ...line, name };
        });
      });
      return any ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesConfig]);

  // 扮演角色是会话级真值：取当前会话 world_state.player_actor_id 的显示名。
  // 世界尚未创建时（player_actor_id 缺省）退化为默认注册表 slug。
  const playedActorId = currentConversationWorldState?.player_actor_id || PLAYER_ACTOR_ID;
  const userRole = slugToName(playedActorId);

  const requireLoginForGame = () => {
    if (currentUser) {
      return true;
    }
    setAuthMode('login');
    setAuthError('请先登录后进入游戏模式，游戏状态需要绑定到你的会话。');
    setAuthDialogOpen(true);
    return false;
  };

  const handleViewModeChange = (nextMode) => {
    if (nextMode === 'game' && !requireLoginForGame()) {
      return;
    }
    setViewMode(nextMode);
  };

  const patchCurrentConversation = (patcher) => {
    setConversations(prev =>
      prev.map(conv => (
        conv.id === currentConversationId ? patcher(conv) : conv
      ))
    );
  };

  const hydrateGameDialogueFromTimeline = async (uiConversationId, backendConversationId) => {
    if (!uiConversationId || !backendConversationId) return;
    try {
      const entries = await getConversationMessages(backendConversationId);
      if (currentConversationIdRef.current !== uiConversationId) return;
      const lines = timelineToGameSpeechLines(entries);
      setGameDialogueByConv((prev) => {
        const existing = prev[uiConversationId] || [];
        // 已有本页 live 追加且更长时保留；否则用服务端权威历史覆盖/填入。
        if (existing.length > lines.length) return prev;
        return { ...prev, [uiConversationId]: lines };
      });
      // 顺带填 chat messages，切回 chat 时不必再点会话列表。
      const uiMessages = timelineToUiMessages(entries);
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== uiConversationId) return c;
          if (c.messages?.length) return c;
          return { ...c, messages: uiMessages };
        })
      );
    } catch (error) {
      console.error('Hydrate game dialogue error', error);
    }
  };

  const ensureCurrentConversationWorld = async () => {
    if (!currentConversation) {
      return null;
    }
    if (!requireLoginForGame()) {
      return null;
    }
    const uiConversationId = currentConversation.id;
    const existing = conversationWorlds[uiConversationId];
    if (existing?.world_state) {
      const backendId = existing.id || currentConversation.backendConversationId;
      void hydrateGameDialogueFromTimeline(uiConversationId, backendId);
      return existing;
    }
    setGameLoading(true);
    try {
      const data = await ensureConversation({
        conversationId: currentConversation.backendConversationId || null,
        title: currentConversation.title,
      });
      if (currentConversationIdRef.current !== uiConversationId) {
        return null;
      }
      // 仅在拿到 backend conversation_id 后才把 game session 写入 map，避免
      // 离线/异常路径产生只有 UI key 的幽灵条目。
      if (data?.id) {
        setConversationWorlds(prev => ({ ...prev, [uiConversationId]: data }));
        currentConversationWorldStateRef.current = data.world_state;
        if (!currentConversation.backendConversationId) {
          setConversations(prev =>
            prev.map(conv => (
              conv.id === uiConversationId
                ? { ...conv, backendConversationId: data.id }
                : conv
            ))
          );
        }
        void hydrateGameDialogueFromTimeline(uiConversationId, data.id);
      }
      return data;
    } finally {
      if (currentConversationIdRef.current === uiConversationId) {
        setGameLoading(false);
      }
    }
  };

  // 切换会话级扮演角色：调后端更新 player_actor_id（就地翻 kind，保留境况）。
  // roleName 是 rolesConfig 中的显示名，解析为对应注册表 slug。
  const handleChangePlayedRole = async (roleName) => {
    if (!currentConversation) return;
    const actorId = nameToSlug(roleName);
    if (!actorId) {
      console.error('无法解析扮演角色对应身份，取消切换：', roleName);
      return;
    }
    if (actorId === playedActorId) return;
    try {
      const ensured = await ensureConversation({
        conversationId: currentConversation.backendConversationId || null,
        title: currentConversation.title,
      });
      const backendConversationId = ensured?.id;
      if (!backendConversationId) {
        console.error('无法创建会话以切换扮演角色');
        return;
      }
      if (!currentConversation.backendConversationId) {
        patchCurrentConversation(conv => ({ ...conv, backendConversationId }));
      }
      const data = await setPlayedRole(backendConversationId, actorId);
      setConversationWorlds(prev => ({ ...prev, [currentConversation.id]: data }));
      currentConversationWorldStateRef.current = data.world_state;
    } catch (error) {
      console.error('切换扮演角色失败', error);
    }
  };

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
    setSidebarOpen(false);
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
      void loadConversationMessagesIfEmpty(id, conv.backendConversationId);
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

  // 游戏气泡内 TTS 按钮回调：按实体 slug 取 default_speaker_id 请求语音并播放。
  // gameTTSInFlightRef 作为最小守卫，避免重复点击并发拉取。
  const handleGameSpeakTTS = async (slug, text) => {
    if (!text || !text.trim()) return;
    if (gameTTSInFlightRef.current) return;
    gameTTSInFlightRef.current = true;
    try {
      const speakerId = slugToSpeaker(slug);
      const audioBlob = await requestTTS(text, slugToName(slug), speakerId);
      const audioUrl = URL.createObjectURL(audioBlob);
      stopCurrentAudio();
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;
      await audio.play();
    } catch (error) {
      console.error('Game TTS Error:', error);
    } finally {
      gameTTSInFlightRef.current = false;
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

  const handleSendMessage = async (message) => {
    // chat 目标身份用角色 slug（唯一事实源为 rolesConfig）。找不到即中止，不静默兜底。
    const targetActorId = nameToSlug(assistantRole);
    if (!targetActorId) {
      console.error('未找到对话角色对应 slug，取消发送：', assistantRole);
      return;
    }
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
    const lastUserMessage = currentConv.messages
      .filter(msg => msg.id !== lastMessageId && msg.role === userRole)
      .pop();
    const content = lastUserMessage?.content || '';
    // 确保 conversation 已在后端创建（自带世界）；chat / game action 共用同一 conversation。
    const ensured = await ensureConversation({
      conversationId: currentConv.backendConversationId || null,
      title: currentConv.title,
    });
    const backendConversationId = ensured.id;
    if (backendConversationId && !currentConv.backendConversationId) {
      setConversations(prev =>
        prev.map(conv =>
          conv.id === currentConversationId
            ? { ...conv, backendConversationId }
            : conv,
        ),
      );
    }

    console.log('[chat] sending', { content, targetActorId, backendConversationId });
    if (streamingEnabled) {
      let responseContent = '';
      sendStreamMessage(
        { conversationId: backendConversationId, targetActorId, content },
        (chunk) => {
          responseContent += chunk;
          updateAssistantMessage(lastMessageId, responseContent, false);
        },
        () => updateAssistantMessage(lastMessageId, responseContent, true),
        (error) => {
          console.error('Stream API Error:', error);
          updateAssistantMessage(lastMessageId, '抱歉，发生了错误，请稍后再试。', true);
        },
      );
    } else {
      sendChatMessage({ conversationId: backendConversationId, targetActorId, content })
        .then(data => {
          const reply = (data.timeline_delta || []).find(
            (e) => e.actor_id === targetActorId && e.speak,
          );
          updateAssistantMessage(lastMessageId, reply?.speak || '（沉默）', true);
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

  const handleGameAction = async (actionPayload) => {
    if (!currentConversation) return;
    if (!requireLoginForGame()) return;
    // 捕获发起时的会话身份；await 之后若已切走则丢弃结果，避免串台。
    const uiConversationId = currentConversation.id;
    // move（只有 act_patch 无 speak）走快路径，不展示 blocking loading：
    // 键盘连按时 spinner 闪烁会很难看。回合的串行化由 GameView 的在途守卫保证
    // （请求在途不发新提交），后端 commit 无乐观锁，靠前端串行避免并发丢写。
    const shouldShowBlockingLoading = Boolean(actionPayload.speak);
    if (shouldShowBlockingLoading) {
      setGameLoading(true);
    }
    try {
      const ensured = await ensureCurrentConversationWorld();
      if (currentConversationIdRef.current !== uiConversationId) {
        return null;
      }
      const worldState = currentConversationWorldStateRef.current || ensured?.world_state;
      const backendConversationId = ensured?.id || currentConversation.backendConversationId;
      const response = await sendPlayerAction(backendConversationId || 0, {
        ...actionPayload,
        conversationId: backendConversationId || null,
        stateVersion: worldState?.state_version || null,
      });

      if (currentConversationIdRef.current !== uiConversationId) {
        return null;
      }

      setConversationWorlds(prev => ({
        ...prev,
        [uiConversationId]: {
          ...(ensured || {}),
          id: response.conversationId,
          state_version: response.stateVersion,
          world_state: response.world_state,
        },
      }));
      currentConversationWorldStateRef.current = response.world_state;

      if (response.conversationId && !currentConversation.backendConversationId) {
        setConversations(prev =>
          prev.map(conv => (
            conv.id === uiConversationId
              ? { ...conv, backendConversationId: response.conversationId }
              : conv
          ))
        );
      }

      // 受控身份 = 会话级 player_actor_id（注册表 slug，默认 "player"）。
      const playerActorId = response.world_state?.player_actor_id
        || worldState?.player_actor_id
        || PLAYER_ACTOR_ID;

      const newMessages = [];
      // speechLines：每条 speak（含玩家自身与 NPC）都进气泡数据源，供场景按实体聚合。
      const speechLines = [];
      if (actionPayload.speak) {
        newMessages.push({
          id: uuidv4(),
          role: slugToName(playerActorId),
          content: actionPayload.speak,
          timestamp: new Date().toISOString(),
          kind: 'player_action',
        });
        speechLines.push({
          actor_id: playerActorId,
          name: slugToName(playerActorId),
          text: actionPayload.speak,
        });
      }
      if (response.narration) {
        newMessages.push({
          id: uuidv4(),
          role: 'scene',
          content: response.narration,
          timestamp: new Date().toISOString(),
          kind: 'narration',
        });
      }
      // timeline_delta 是后端权威事件流；玩家自身条目已在上面单独处理，这里只收其余 NPC speak / scene。
      (response.timeline_delta || []).forEach((entry) => {
        if (entry.actor_id === playerActorId) return;
        if (entry.kind === 'scene') {
          newMessages.push({
            id: uuidv4(),
            role: 'scene',
            content: entry.speak || entry.narration,
            timestamp: entry.created_at || new Date().toISOString(),
            kind: 'narration',
          });
          return;
        }
        if (entry.speak) {
          newMessages.push({
            id: uuidv4(),
            role: getEntityName(response.world_state, entry.actor_id),
            content: entry.speak,
            timestamp: entry.created_at || new Date().toISOString(),
            kind: 'npc_line',
            metadata_json: entry,
          });
          speechLines.push({
            actor_id: entry.actor_id,
            name: getEntityName(response.world_state, entry.actor_id),
            text: entry.speak,
          });
        }
      });
      if (newMessages.length) {
        setConversations(prev =>
          prev.map(conv => (
            conv.id === uiConversationId
              ? { ...conv, messages: [...(conv.messages || []), ...newMessages] }
              : conv
          ))
        );
      }
      if (speechLines.length) {
        setGameDialogueByConv(prev => ({
          ...prev,
          [uiConversationId]: [...(prev[uiConversationId] || []), ...speechLines],
        }));
      }
      return response;
    } catch (error) {
      console.error('Game action error', error);
      throw error;
    } finally {
      if (shouldShowBlockingLoading) {
        setGameLoading(false);
      }
    }
  };

  // 按实体聚合"每个 slug 的最近一句"，供游戏内常驻气泡绑定。
  const gameSpeechByActor = useMemo(() => {
    const map = {};
    for (const line of gameDialogueLines) {
      if (line.actor_id) map[line.actor_id] = line.text;
    }
    return map;
  }, [gameDialogueLines]);

  // 可 TTS 的实体集合：仅含配了 default_speaker_id 的注册表 slug。
  // 未配语音的角色（含无 speaker 的 player）不在其中，其气泡不渲染 TTS 按钮。
  const speakableActorIds = useMemo(() => {
    const set = new Set();
    (rolesConfig?.roles || []).forEach((r) => {
      if (r.slug && r.default_speaker_id) set.add(r.slug);
    });
    return set;
  }, [rolesConfig]);

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
      <Box
        onMouseEnter={handleZenLeftEnter}
        onMouseLeave={handleZenLeftLeave}
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: leftPeek ? 308 : 14,
          zIndex: (muiTheme) => muiTheme.zIndex.drawer + 6,
          pointerEvents: zenPinned ? 'auto' : 'none',
          transition: 'width 160ms ease',
        }}
      />
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: (muiTheme) => muiTheme.zIndex.appBar + 4,
          pointerEvents: 'auto',
        }}
      >
        <Header
          zenMode={false}
          condensed={topbarCondensed}
          onSidebarToggle={isChatPage ? handleSidebarToggle : undefined}
          onNewChat={isChatPage ? handleCreateNewChat : undefined}
          onOpenControlCenter={openControlCenter}
          viewMode={viewMode}
          onViewModeChange={isChatPage ? handleViewModeChange : undefined}
        />
      </Box>
      <Box component="main" id="main-content" sx={{ display: 'flex', flex: 1, minHeight: 0, pb: 0 }}>
        <Routes>
          <Route
            path="/"
            element={
              <ChatPage
                sidebarOpen={effectiveSidebarOpen}
                isMobile={isMobile}
                zenMode={zenMode}
                conversations={conversations}
                currentConversationId={currentConversationId}
                onSelectConversation={handleSelectConversation}
                onNewChat={handleCreateNewChat}
                onDeleteConversation={handleDeleteConversation}
                onUpdateTitle={handleUpdateConversationTitle}
                onCloseSidebar={() => {
                  setSidebarPreviewActive(false);
                  setLeftPeek(false);
                  setSidebarOpen(false);
                }}
                conversation={currentConversation}
                onSendMessage={handleSendMessage}
                onPlayMessageAudio={handlePlayMessageAudio}
                onRetryMessageAudio={handleRetryMessageAudio}
                userRole={userRole}
                assistantRole={assistantRole}
                setUserRole={handleChangePlayedRole}
                setAssistantRole={setAssistantRole}
                rolesConfig={rolesConfig}
                onZenActivate={activateZenMode}
                onTopbarCondenseChange={setTopbarCondensed}
                viewMode={viewMode}
                gameWorldState={currentConversationWorldState}
                gameConversationKey={currentConversation?.id || null}
                gameLoading={gameLoading}
                gameDialogueLines={gameDialogueLines}
                gameSpeechByActor={gameSpeechByActor}
                gameSpeakableActorIds={speakableActorIds}
                onGameAction={handleGameAction}
                onChangePlayedRole={handleChangePlayedRole}
                onGameSpeakTTS={handleGameSpeakTTS}
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
            backgroundColor: 'transparent',
            backdropFilter: 'blur(20px)',
            background: theme.palette.mode === 'light'
              ? 'linear-gradient(180deg, rgba(249, 251, 255, 0.94), rgba(245, 248, 255, 0.86))'
              : 'linear-gradient(180deg, rgba(16, 15, 14, 0.95), rgba(16, 15, 14, 0.84))',
            '@keyframes controlCenterIn': {
              from: { opacity: 0, transform: 'translateX(12px)' },
              to: { opacity: 1, transform: 'translateX(0)' },
            },
            animation: 'controlCenterIn 220ms ease-out',
          },
        }}
      >
        <Box sx={{ p: 2 }}>
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
              setUserRole={handleChangePlayedRole}
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
            borderRadius: 4,
            background: theme.palette.mode === 'light'
              ? 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(246,249,255,0.92))'
              : 'linear-gradient(180deg, rgba(20,19,18,0.95), rgba(14,13,12,0.95))',
            boxShadow: theme.palette.mode === 'light'
              ? '0 20px 60px rgba(12, 32, 78, 0.18)'
              : '0 20px 60px rgba(0, 0, 0, 0.48)',
            backdropFilter: 'blur(16px)',
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
        PaperProps={{
          sx: {
            borderRadius: 4,
            background: theme.palette.mode === 'light'
              ? 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(246,249,255,0.92))'
              : 'linear-gradient(180deg, rgba(20,19,18,0.95), rgba(14,13,12,0.95))',
            backdropFilter: 'blur(16px)',
            boxShadow: theme.palette.mode === 'light'
              ? '0 20px 60px rgba(12, 32, 78, 0.18)'
              : '0 20px 60px rgba(0, 0, 0, 0.48)',
          },
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
