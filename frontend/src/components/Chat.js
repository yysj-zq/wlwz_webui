import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  useMediaQuery,
  CircularProgress,
  IconButton,
  Tooltip,
  Chip,
  Collapse,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ReplayIcon from '@mui/icons-material/Replay';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';
import { useTheme } from '../contexts/ThemeContext';
import { RoleSelector } from './RoleSelector';
import {
  StageShell,
  ScriptColumn,
  DirectorPanel,
  RoleBioCard,
  ComposerCard,
  SceneBanner,
  MessageContainer,
  StyledAvatar
} from './styles/ChatStyles';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8081';

// 无头像时使用的占位图（灰色圆形 SVG，不依赖任何静态文件）
const PLACEHOLDER_AVATAR = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="#9e9e9e"><circle cx="24" cy="24" r="24"/><text x="24" y="30" text-anchor="middle" fill="#fff" font-size="20" font-family="sans-serif">?</text></svg>'
);

const Chat = ({
  conversation,
  onSendMessage,
  onPlayMessageAudio,
  onRetryMessageAudio,
  userRole,
  assistantRole,
  setUserRole,
  setAssistantRole,
  rolesConfig,
  zenMode = false,
  onZenActivate,
  onTopbarCondenseChange,
}) => {
  const roleList = rolesConfig?.roles?.map((r) => ({
    name: r.name,
    avatar: r.avatar_url ? (r.avatar_url.startsWith('http') ? r.avatar_url : `${API_BASE}${r.avatar_url}`) : '',
    description: (r.system_prompt || '').slice(0, 40) + ((r.system_prompt || '').length > 40 ? '…' : ''),
  })) || [];
  const getAvatarForRole = (roleName) => {
    const r = rolesConfig?.roles?.find((x) => x.name === roleName);
    if (!r?.avatar_url) return PLACEHOLDER_AVATAR;
    return r.avatar_url.startsWith('http') ? r.avatar_url : `${API_BASE}${r.avatar_url}`;
  };
  const { theme } = useTheme();
  const [message, setMessage] = useState('');
  const [controlsOpen, setControlsOpen] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const checkOverflow = () => {
      const overflow = el.scrollHeight - el.clientHeight > 6;
      setHasOverflow(overflow);
    };

    checkOverflow();
    const raf = requestAnimationFrame(checkOverflow);
    window.addEventListener('resize', checkOverflow);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', checkOverflow);
    };
  }, [conversation, controlsOpen, zenMode, isMobile]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const notifyScrollState = () => {
      onTopbarCondenseChange?.(el.scrollTop > 8);
    };

    notifyScrollState();
    el.addEventListener('scroll', notifyScrollState, { passive: true });
    window.addEventListener('resize', notifyScrollState);

    return () => {
      el.removeEventListener('scroll', notifyScrollState);
      window.removeEventListener('resize', notifyScrollState);
    };
  }, [onTopbarCondenseChange, conversation?.id]);

  const handleSendMessage = () => {
    if (message.trim()) {
      onZenActivate?.();
      onSendMessage(message.trim());
      setMessage('');
      // 聚焦回输入框
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getMessageType = (role) => {
    if (role === 'scene') return 'scene';
    if (role === userRole) return 'user';
    if (role === assistantRole) return 'assistant';
    return 'assistant';
  };

  const historicalActors = Array.from(
    new Set(
      (conversation?.messages || [])
        .map((msg) => msg.role)
        .filter((role) => role && role !== 'scene')
    )
  );

  const currentScene = (() => {
    const list = conversation?.messages || [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].role === 'scene' && String(list[i].content || '').trim()) {
        return list[i].content.trim();
      }
    }
    return '未设置场景';
  })();

  const dialogueCount = (conversation?.messages || []).filter((msg) => msg.role !== 'scene').length;

  // 渲染markdown内容
  const renderMarkdown = (content) => {
    // // 预处理内容，转义<think>和</think>标签，使其能够正常显示
    // let processedContent = content;
    // if (content && typeof content === 'string') {
    //   // 替换<think>和</think>标签为转义后的形式，使其显示为文本
    //   processedContent = content
    //     .replace(/<think>/g, '\\<think\\>')
    //     .replace(/<\/think>/g, '\\</think\\>');
    // }
    let processedContent = content;

    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeHighlight]}
        className="markdown-body"
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <pre className={`language-${match[1]}`}>
                <code className={`language-${match[1]}`} {...props}>
                  {children}
                </code>
              </pre>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    );
  };

  return (
    <StageShell>
      <ScriptColumn
        sx={{
          pt: hasOverflow ? 0 : { xs: '56px', md: '72px' },
          transition: 'padding-top 220ms ease',
        }}
      >
        <SceneBanner
          sx={{
            opacity: zenMode ? 0 : 1,
            maxHeight: zenMode ? 0 : 120,
            overflow: 'hidden',
            transform: zenMode ? 'translateY(-8px)' : 'translateY(0)',
            transition: 'opacity 200ms ease, max-height 260ms ease, transform 200ms ease',
          }}
        >
          <Typography variant="overline" sx={{ letterSpacing: 1.2, opacity: 0.82 }}>
            Stage Focus
          </Typography>
          <Typography
            variant="h6"
            sx={{
              lineHeight: 1.15,
              mt: 0.25,
              fontSize: { xs: '1.1rem', md: '1.6rem' },
              fontFamily: '"Sora", "Outfit", sans-serif',
            }}
          >
            {conversation?.title || '未命名场次'}
          </Typography>
        </SceneBanner>

        <Box
          ref={messagesContainerRef}
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            px: { xs: 1, md: zenMode ? 3 : 2 },
            pb: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            transition: 'padding 220ms ease',
          }}
        >
          {conversation?.messages?.length === 0 ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                textAlign: 'center'
              }}
            >
              <Typography variant="h5" color="text.secondary" gutterBottom>
                舞台已就绪
              </Typography>
              <Typography variant="body1" color="text.secondary">
                写下第一句台词，故事会从你按下发送的瞬间开始。
              </Typography>
            </Box>
          ) : (
            conversation?.messages?.map((msg) => (
              <MessageContainer
                key={msg.id}
                className={`message-${getMessageType(msg.role)}`}
              >
                {msg.role === 'scene' ? (
                  <Box sx={{ width: '100%', textAlign: 'center', color: theme.palette.text.secondary }}>
                    <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                      场景：{msg.content}
                    </Typography>
                  </Box>
                ) : (
                  <>
                    <StyledAvatar>
                      <img
                        src={getAvatarForRole(msg.role)}
                        alt={msg.role}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          opacity: 0.94,
                          filter: 'saturate(0.92) contrast(1.03)',
                        }}
                        onError={(e) => { e.target.src = PLACEHOLDER_AVATAR; }}
                      />
                    </StyledAvatar>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.35, gap: 1 }}>
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontSize: '0.79rem',
                            fontWeight: 600,
                            letterSpacing: 0.2,
                            opacity: 0.8,
                          }}
                        >
                          {msg.role}
                        </Typography>
                        {msg.role === assistantRole && !msg.loading && (
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            {msg.audioLoading && <CircularProgress size={14} sx={{ mr: 0.5 }} />}
                            {msg.audioUrl && (
                              <Tooltip title="重播语音">
                                <IconButton
                                  size="small"
                                  onClick={() => onPlayMessageAudio?.(msg.id)}
                                  aria-label="重播语音"
                                >
                                  <ReplayIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        )}
                      </Box>
                      <Box>
                        {msg.loading ? (
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <CircularProgress size={18} sx={{ mr: 1 }} />
                            <Typography variant="body2">
                              <Box component="span" role="status" aria-live="polite">
                                {msg.content || '正在组织下一句台词…'}
                              </Box>
                            </Typography>
                          </Box>
                        ) : (
                          renderMarkdown(msg.content)
                        )}
                      </Box>
                      {msg.audioError && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }} role="status" aria-live="polite">
                          <Typography variant="caption" color="error">
                            {msg.audioError}
                          </Typography>
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => onRetryMessageAudio?.(msg.id)}
                            disabled={msg.audioLoading}
                            sx={{ minWidth: 'auto', px: 0.5, fontSize: '0.75rem' }}
                          >
                            重试语音
                          </Button>
                        </Box>
                      )}
                    </Box>
                  </>
                )}
              </MessageContainer>
            ))
          )}
          <div ref={messagesEndRef} />
        </Box>

        <ComposerCard
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
        >
          <Collapse in={controlsOpen}>
            <DirectorPanel sx={{ mt: 0, mb: 1.2 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 1 }}>
                <RoleBioCard>
                  <Typography variant="caption" color="text.secondary">
                    扮演角色
                  </Typography>
                  <RoleSelector
                    assistantRole={userRole}
                    setAssistantRole={setUserRole}
                    roleList={roleList}
                  />
                </RoleBioCard>
                <RoleBioCard>
                  <Typography variant="caption" color="text.secondary">
                    对话角色
                  </Typography>
                  <RoleSelector
                    assistantRole={assistantRole}
                    setAssistantRole={setAssistantRole}
                    roleList={roleList}
                  />
                </RoleBioCard>
                <RoleBioCard>
                  <Typography variant="caption" color="text.secondary">
                    场景信息
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.65 }}>
                    {currentScene}
                  </Typography>
                </RoleBioCard>
              </Box>
            </DirectorPanel>
          </Collapse>
          {!zenMode && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
              <Chip size="small" label={`对话 ${dialogueCount} 条`} />
              {historicalActors.slice(0, 3).map((actor) => (
                <Chip key={actor} size="small" variant="outlined" label={actor} />
              ))}
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton
              onClick={() => setControlsOpen((prev) => !prev)}
              aria-label="显示或隐藏控制面板"
              sx={{
                width: 40,
                height: 40,
                backgroundColor: theme.palette.mode === 'light' ? 'rgba(255,255,255,0.66)' : 'rgba(255,255,255,0.12)',
                '&:hover': {
                  backgroundColor: theme.palette.mode === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.2)',
                },
              }}
            >
              <TuneRoundedIcon />
            </IconButton>
            <TextField
              fullWidth
              variant="outlined"
              placeholder={`以“${userRole}”身份，回应“${assistantRole}”…`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => onZenActivate?.()}
              multiline
              maxRows={5}
              inputRef={inputRef}
              autoFocus
              size="small"
              name="chat-message"
              autoComplete="off"
              inputProps={{
                'aria-label': '聊天消息输入框',
                spellCheck: false,
              }}
            />
            <Button
              variant="contained"
              color="primary"
              endIcon={<SendIcon />}
              onClick={handleSendMessage}
              disabled={!message.trim()}
              sx={{ minWidth: isMobile ? 'auto' : 112, px: isMobile ? 1 : 2 }}
              aria-label="发送消息"
            >
              {isMobile ? '' : '发送台词'}
            </Button>
          </Box>
        </ComposerCard>
      </ScriptColumn>
    </StageShell>
  );
};

export default Chat;
