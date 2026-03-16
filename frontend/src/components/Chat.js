import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Divider,
  useMediaQuery,
  CircularProgress,
  IconButton,
  Tooltip
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
import { MessageContainer, StyledAvatar } from './styles/ChatStyles';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8081';

// 无头像时使用的占位图（灰色圆形 SVG，不依赖任何静态文件）
const PLACEHOLDER_AVATAR = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="#9e9e9e"><circle cx="24" cy="24" r="24"/><text x="24" y="30" text-anchor="middle" fill="#fff" font-size="20" font-family="sans-serif">?</text></svg>'
);

const Chat = ({ conversation, onSendMessage, onPlayMessageAudio, onRetryMessageAudio, userRole, assistantRole, setUserRole, sidebarOpen, rolesConfig }) => {
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
    <Box
      sx={{
        flexGrow: 1,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        transition: theme => theme.transitions.create(['margin', 'width'], {
          easing: theme.transitions.easing.sharp,
          duration: theme.transitions.duration.leavingScreen,
        }),
      }}
    >
      {/* 对话记录 */}
      <Box
        sx={{
          flexGrow: 1,
          overflow: 'auto',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: theme.palette.background.chat,
        }}
      >
        {conversation?.messages?.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%'
            }}
          >
            <Typography variant="h5" color="text.secondary" gutterBottom>
              开始一个新的对话
            </Typography>
            <Typography variant="body1" color="text.secondary" align="center">
              当前对话角色: <strong>{userRole}</strong> ↔ <strong>{assistantRole}</strong>
            </Typography>
          </Box>
        ) : (
          conversation?.messages?.map((msg, index) => (
            <MessageContainer
              key={msg.id}
              className={`message-${getMessageType(msg.role)}`}
            >
              {msg.role === 'scene' ? (
                // 场景消息的特殊显示
                <Box sx={{ 
                  width: '100%', 
                  textAlign: 'center', 
                  padding: '10px',
                  fontStyle: 'italic',
                  color: theme.palette.text.secondary
                }}>
                  <Typography variant="body1">
                    {msg.content}
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
                  <Box sx={{ flexGrow: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
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
                          <CircularProgress size={20} sx={{ mr: 1 }} />
                          <Typography variant="body1">
                            <Box component="span" role="status" aria-live="polite">
                              {msg.content || '思考中…'}
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

      {/* 输入框和发送按钮 */}
      <Box
        component="form"
        sx={{
          p: 2,
          backgroundColor: theme.palette.background.paper,
          borderTop: `1px solid ${theme.palette.divider}`,
          display: 'flex',
          alignItems: 'center',
          flexDirection: 'row',
        }}
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
      >
        {/* 当前角色与头像 */}
        <Box sx={{ mr: 2 }}>
          <RoleSelector
            assistantRole={userRole}
            setAssistantRole={setUserRole}
            position="bottom"
            roleList={roleList}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder={`以“${userRole}”的身份发送消息给“${assistantRole}”…`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            multiline
            maxRows={4}
            inputRef={inputRef}
            autoFocus
            size="small"
            sx={{ mr: 1 }}
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
            sx={{ minWidth: isMobile ? 'auto' : 100, px: isMobile ? 1 : 2 }}
            aria-label="发送消息"
          >
            {isMobile ? '' : '发送'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default Chat;
