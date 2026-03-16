import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Avatar,
  Typography,
  TextField,
  Button,
  Divider,
  useMediaQuery,
  CircularProgress,
  IconButton,
  Tooltip,
  Chip
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ReplayIcon from '@mui/icons-material/Replay';
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

const Chat = ({ conversation, onSendMessage, onPlayMessageAudio, onRetryMessageAudio, userRole, assistantRole, setUserRole, setAssistantRole, sidebarOpen, rolesConfig }) => {
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
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation]);

  const handleSendMessage = () => {
    if (message.trim()) {
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

  const getRoleMeta = (roleName) => {
    const role = rolesConfig?.roles?.find((x) => x.name === roleName);
    return {
      description: (role?.system_prompt || '暂无角色设定').slice(0, 78) + ((role?.system_prompt || '').length > 78 ? '…' : ''),
      avatar: getAvatarForRole(roleName),
    };
  };

  const inferEmotion = (text = '') => {
    const source = String(text || '');
    if (!source.trim()) return { label: '待机', color: 'default' };
    if (/！|!|激动|冲啊|马上|必须/.test(source)) return { label: '激昂', color: 'warning' };
    if (/？|\?|困惑|为何|怎么/.test(source)) return { label: '疑惑', color: 'info' };
    if (/怒|气|可恶|生气/.test(source)) return { label: '愠怒', color: 'error' };
    if (/哈哈|开心|高兴|喜悦/.test(source)) return { label: '愉悦', color: 'success' };
    return { label: '平稳', color: 'default' };
  };

  const getLatestRoleMessage = (roleName) => {
    const list = conversation?.messages || [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].role === roleName) return list[i].content || '';
    }
    return '';
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
      <ScriptColumn>
        <SceneBanner>
          <Typography variant="overline" sx={{ letterSpacing: 1.2, opacity: 0.75 }}>
            Conversation Info
          </Typography>
          <Typography variant="h6" sx={{ lineHeight: 1.2, mt: 0.25 }}>
            {conversation?.title || '未命名场次'}
          </Typography>
        </SceneBanner>

        <Box
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            px: 2,
            pb: 1,
            minHeight: 0,
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
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { e.target.src = PLACEHOLDER_AVATAR; }}
                      />
                    </StyledAvatar>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="subtitle2" fontWeight="bold">
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

        <Divider />
        <ComposerCard
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
        >
          {isMobile && (
            <Box sx={{ mb: 1.25, display: 'grid', gap: 1 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Box sx={{ display: 'grid', gap: 0.75, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary">
                    扮演角色
                  </Typography>
                  <RoleSelector
                    assistantRole={userRole}
                    setAssistantRole={setUserRole}
                    position="top"
                    roleList={roleList}
                  />
                </Box>
                <Box sx={{ display: 'grid', gap: 0.75, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary">
                    对话角色
                  </Typography>
                  <RoleSelector
                    assistantRole={assistantRole}
                    setAssistantRole={setAssistantRole}
                    position="top"
                    roleList={roleList}
                  />
                </Box>
              </Box>
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder={`以“${userRole}”身份，回应“${assistantRole}”…`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
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

      {!isMobile && (
        <DirectorPanel>
          <Typography variant="h6">场景控制台</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            <Box sx={{ display: 'grid', gap: 0.75, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">
                扮演角色
              </Typography>
              <RoleSelector assistantRole={userRole} setAssistantRole={setUserRole} position="bottom" roleList={roleList} />
            </Box>
            <Box sx={{ display: 'grid', gap: 0.75, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">
                对话角色
              </Typography>
              <RoleSelector assistantRole={assistantRole} setAssistantRole={setAssistantRole} position="bottom" roleList={roleList} />
            </Box>
          </Box>

          <Divider sx={{ my: 1 }} />
          {[userRole, assistantRole].map((roleName, idx) => {
            const meta = getRoleMeta(roleName);
            const latestMessage = getLatestRoleMessage(roleName);
            const emotion = inferEmotion(latestMessage);
            return (
              <RoleBioCard key={`${roleName}-${idx}`}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Avatar src={meta.avatar} alt={roleName} sx={{ width: 38, height: 38 }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ lineHeight: 1.1 }}>
                      {roleName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {idx === 0 ? '扮演角色' : '对话角色'}
                    </Typography>
                  </Box>
                  <Box sx={{ ml: 'auto' }}>
                    <Chip size="small" label={emotion.label} color={emotion.color} variant="outlined" />
                  </Box>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {meta.description}
                </Typography>
              </RoleBioCard>
            );
          })}

          <Divider sx={{ my: 1 }} />
          <Typography variant="subtitle2">当前舞台信息</Typography>
          <Typography variant="body2" color="text.secondary">
            当前场景：{currentScene}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            对话条目：{dialogueCount}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            历史角色：{historicalActors.length ? historicalActors.join('、') : '暂无'}
          </Typography>
        </DirectorPanel>
      )}
    </StageShell>
  );
};

export default Chat;
