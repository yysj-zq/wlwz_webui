import {
  AppBar,
  Toolbar,
  Box,
  Typography,
  IconButton,
} from '@mui/material';
import { useTheme } from '../contexts/ThemeContext';
import AddIcon from '@mui/icons-material/Add';
import SettingsIcon from '@mui/icons-material/Settings';
import ViewSidebarRoundedIcon from '@mui/icons-material/ViewSidebarRounded';
import React from 'react';

const Header = ({
  zenMode = false,
  condensed = false,
  onSidebarToggle,
  onNewChat,
  onOpenControlCenter,
}) => {
  const { mode } = useTheme();

  const actionButtonSx = {
    width: 36,
    height: 36,
    ml: 0.6,
    color: mode === 'light' ? '#2f3c5a' : '#d7deef',
    background: mode === 'light'
      ? 'rgba(255,255,255,0.45)'
      : 'rgba(255,255,255,0.08)',
    borderRadius: '10px',
    backdropFilter: 'blur(10px) saturate(120%)',
    boxShadow: mode === 'light'
      ? 'inset 0 1px 0 rgba(255,255,255,0.68), 0 6px 16px rgba(28, 45, 84, 0.1)'
      : 'inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 18px rgba(0, 0, 0, 0.32)',
    transition: 'transform 160ms ease, background 160ms ease, box-shadow 160ms ease, color 160ms ease',
    '&:hover': {
      background: mode === 'light'
        ? 'rgba(255,255,255,0.68)'
        : 'rgba(255,255,255,0.16)',
      boxShadow: mode === 'light'
        ? 'inset 0 1px 0 rgba(255,255,255,0.82), 0 8px 20px rgba(28, 45, 84, 0.14)'
        : 'inset 0 1px 0 rgba(255,255,255,0.24), 0 10px 22px rgba(0, 0, 0, 0.38)',
      transform: 'translateY(-1px)',
    },
  };

  return (
    <>
      <AppBar
        position="static"
        color="default"
        elevation={0}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          borderRadius: 0,
          background: 'transparent',
          boxShadow: 'none',
          opacity: zenMode ? 0 : 1,
          transform: zenMode ? 'translateY(-12px)' : 'translateY(0)',
          transition: 'opacity 220ms ease, transform 220ms ease',
        }}
      >
        <Toolbar
          sx={{
            minHeight: condensed ? 56 : 62,
            mt: condensed ? 0.6 : 1.2,
            mx: 'auto',
            width: 'min(1100px, calc(100% - 20px))',
            px: { xs: 1.2, sm: 1.8 },
            gap: 1,
            borderRadius: '16px',
            background: mode === 'light'
              ? (condensed
                ? 'linear-gradient(180deg, rgba(255,255,255,0.84), rgba(246,249,255,0.72))'
                : 'linear-gradient(180deg, rgba(255,255,255,0.66), rgba(246,249,255,0.52))')
              : (condensed
                ? 'linear-gradient(180deg, rgba(21,27,40,0.74), rgba(21,27,40,0.58))'
                : 'linear-gradient(180deg, rgba(21,27,40,0.58), rgba(21,27,40,0.4))'),
            backdropFilter: 'blur(16px) saturate(124%)',
            boxShadow: mode === 'light'
              ? (condensed
                ? 'inset 0 1px 0 rgba(255,255,255,0.9), 0 12px 26px rgba(27, 44, 83, 0.16)'
                : 'inset 0 1px 0 rgba(255,255,255,0.82), 0 8px 24px rgba(27, 44, 83, 0.12)')
              : (condensed
                ? 'inset 0 1px 0 rgba(255,255,255,0.16), 0 16px 30px rgba(0, 0, 0, 0.42)'
                : 'inset 0 1px 0 rgba(255,255,255,0.12), 0 12px 26px rgba(0, 0, 0, 0.36)'),
            transition: 'min-height 180ms ease, margin-top 180ms ease, background 180ms ease, box-shadow 180ms ease',
          }}
        >
          <Box sx={{ flexGrow: 1, minWidth: 0, pl: 0.4 }}>
            <Typography
              variant="body2"
              component="div"
              sx={{
                fontFamily: '"Manrope", "Noto Sans SC", sans-serif',
                fontWeight: 600,
                letterSpacing: 0.3,
                color: mode === 'light' ? '#2a3551' : '#dbe5ff',
                lineHeight: 1.15,
              }}
            >
              武林外传 AI 聊天
            </Typography>
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                opacity: condensed ? 0.55 : 0.7,
                letterSpacing: 0.7,
                color: mode === 'light' ? '#6f7f9f' : '#95a6cb',
                textTransform: 'uppercase',
                transition: 'opacity 180ms ease',
              }}
            >
              Story Console
            </Typography>
          </Box>

          {onSidebarToggle ? (
            <IconButton
              color="inherit"
              aria-label="显示或隐藏会话列表"
              onClick={onSidebarToggle}
              sx={actionButtonSx}
            >
              <ViewSidebarRoundedIcon />
            </IconButton>
          ) : null}
          {onNewChat ? (
            <IconButton
              color="inherit"
              aria-label="新建对话"
              onClick={onNewChat}
              sx={actionButtonSx}
            >
              <AddIcon />
            </IconButton>
          ) : null}
          <IconButton
            color="inherit"
            aria-label="打开控制中心"
            onClick={() => onOpenControlCenter?.()}
            sx={actionButtonSx}
          >
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
    </>
  );
};

export default Header;
