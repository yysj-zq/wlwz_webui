import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Avatar,
  Divider,
  useMediaQuery,
  CircularProgress
} from '@mui/material';
import { styled } from '@mui/material/styles';
import SendIcon from '@mui/icons-material/Send';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';
import { useTheme } from '../contexts/ThemeContext';
import { RoleSelector, RolePool } from './RoleSelector';
const MessageContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  marginBottom: theme.spacing(2),
  padding: theme.spacing(1.5),
  borderRadius: theme.spacing(2),
  backgroundColor: 'transparent',
  position: 'relative',
  overflow: 'hidden',
  boxShadow: theme.palette.mode === 'light' 
    ? `0 2px 8px ${theme.palette.divider}30`
    : `0 2px 8px ${theme.palette.divider}50`,
  '&.user': {
    backgroundColor: theme.palette.mode === 'light' 
      ? `${theme.palette.background.paper}D0` 
      : `${theme.palette.background.paper}B0`,
    border: `1px solid ${theme.palette.mode === 'light' 
      ? theme.palette.primary.main + '40' 
      : theme.palette.primary.main + '60'}`,
    // 添加纹理背景
    backgroundImage: theme.palette.mode === 'light' 
      ? `repeating-linear-gradient(45deg, ${theme.palette.primary.main}15 0px, ${theme.palette.primary.main}15 2px, transparent 2px, transparent 8px)`
      : `repeating-linear-gradient(45deg, ${theme.palette.primary.main}20 0px, ${theme.palette.primary.main}20 2px, transparent 2px, transparent 8px)`,
  },
  '&.assistant': {
    backgroundColor: theme.palette.mode === 'light' 
      ? `${theme.palette.background.default}D0` 
      : `${theme.palette.background.default}B0`,
    border: `1px solid ${theme.palette.mode === 'light' 
      ? theme.palette.secondary.main + '40' 
      : theme.palette.secondary.main + '60'}`,
    // 添加纹理背景
    backgroundImage: theme.palette.mode === 'light' 
      ? `repeating-linear-gradient(-45deg, ${theme.palette.secondary.main}15 0px, ${theme.palette.secondary.main}15 2px, transparent 2px, transparent 8px)`
      : `repeating-linear-gradient(-45deg, ${theme.palette.secondary.main}20 0px, ${theme.palette.secondary.main}20 2px, transparent 2px, transparent 8px)`,
  },
  // 添加装饰性边角
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: theme.spacing(2),
    pointerEvents: 'none',
    border: `1px solid ${theme.palette.divider}30`,
  }
}));

const StyledAvatar = styled(Avatar)(({ theme }) => ({
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.primary.contrastText,
  marginRight: theme.spacing(2),
}));

const Chat = ({ conversation, onSendMessage, userRole, assistantRole, setUserRole, sidebarOpen }) => {
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
              className={msg.role}
            >
              <StyledAvatar>
                <img
                  src={RolePool.find(role => role.name === msg.role).avatar}
                  alt={msg.role}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />

              </StyledAvatar>
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                  {msg.role}
                </Typography>
                <Box>
                  {msg.loading ? (
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <CircularProgress size={20} sx={{ mr: 1 }} />
                      <Typography variant="body1">
                        {msg.content || '思考中...'}
                      </Typography>
                    </Box>
                  ) : (
                    renderMarkdown(msg.content)
                  )}
                </Box>
              </Box>
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
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder={`以"${userRole}"的身份发送消息给"${assistantRole}"`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            multiline
            maxRows={4}
            inputRef={inputRef}
            autoFocus
            size="small"
            sx={{ mr: 1 }}
          />
          <Button
            variant="contained"
            color="primary"
            endIcon={<SendIcon />}
            onClick={handleSendMessage}
            disabled={!message.trim()}
            sx={{ minWidth: isMobile ? 'auto' : 100, px: isMobile ? 1 : 2 }}
          >
            {isMobile ? '' : '发送'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default Chat;
