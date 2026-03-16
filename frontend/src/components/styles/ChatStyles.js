import { styled } from '@mui/material/styles';
import { Box, Avatar } from '@mui/material';

export const MessageContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  marginBottom: theme.spacing(2),
  padding: theme.spacing(1.5),
  borderRadius: theme.spacing(2),
  backgroundColor: 'transparent',
  position: 'relative',
  // 移除 overflow: 'hidden' 以允许内容正常显示
  boxShadow: theme.palette.mode === 'light' 
    ? `0 2px 8px ${theme.palette.divider}30`
    : `0 2px 8px ${theme.palette.divider}50`,
  '&.message-user': {
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
  '&.message-assistant': {
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
  '&.message-scene': {
    justifyContent: 'center',
    backgroundColor: `${theme.palette.background.paper}88`,
    border: `1px dashed ${theme.palette.divider}`,
    boxShadow: 'none',
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

export const StyledAvatar = styled(Avatar)(({ theme }) => ({
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.primary.contrastText,
  marginRight: theme.spacing(2),
}));