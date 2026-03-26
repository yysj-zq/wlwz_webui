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
    background: 'transparent',
    borderRadius: '10px',
    boxShadow: 'none',
    transition: 'background 160ms ease, color 160ms ease',
    '&:hover': {
      background: mode === 'light' ? 'rgba(19, 28, 46, 0.06)' : 'rgba(255,255,255,0.08)',
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
            mt: 0,
            width: '100%',
            mx: 0,
            px: { xs: 1.2, sm: 2.2 },
            gap: 1,
            borderRadius: 0,
            background: mode === 'light'
              ? 'rgba(255, 255, 255, 0.58)'
              : 'rgba(11, 12, 15, 0.56)',
            backdropFilter: 'blur(8px) saturate(110%)',
            WebkitBackdropFilter: 'blur(8px) saturate(110%)',
            boxShadow: 'none',
            borderBottom: mode === 'light'
              ? '1px solid rgba(19, 28, 46, 0.10)'
              : '1px solid rgba(255, 255, 255, 0.10)',
            transition: 'min-height 180ms ease, background 180ms ease',
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
                color: mode === 'light' ? '#2a3551' : 'rgba(243,239,231,0.96)',
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
                color: mode === 'light' ? '#6f7f9f' : 'rgba(184,175,162,0.9)',
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
