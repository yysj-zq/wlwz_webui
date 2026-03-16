import {
  AppBar,
  Toolbar,
  Box,
  Typography,
  IconButton,
  Tooltip,
} from '@mui/material';
import { useTheme } from '../contexts/ThemeContext';
import MenuIcon from '@mui/icons-material/Menu';
import AddIcon from '@mui/icons-material/Add';
import SettingsIcon from '@mui/icons-material/Settings';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';

const Header = ({
  onSidebarToggle,
  onNewChat,
  onOpenControlCenter,
}) => {
  const { mode, toggleMode } = useTheme();
  const actionButtonSx = {
    width: 38,
    height: 38,
    ml: 0.75,
    border: mode === 'light' ? '1px solid rgba(122, 67, 36, 0.22)' : '1px solid rgba(226, 190, 141, 0.25)',
    background: mode === 'light'
      ? 'linear-gradient(180deg, rgba(255,255,255,0.62), rgba(160,82,45,0.14))'
      : 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(210,180,140,0.18))',
    boxShadow: mode === 'light'
      ? '0 2px 8px rgba(93, 52, 27, 0.14)'
      : '0 2px 8px rgba(0, 0, 0, 0.32)',
    transition: 'transform 160ms ease, background 160ms ease, box-shadow 160ms ease',
    '&:hover': {
      background: mode === 'light'
        ? 'linear-gradient(180deg, rgba(255,255,255,0.72), rgba(160,82,45,0.22))'
        : 'linear-gradient(180deg, rgba(255,255,255,0.14), rgba(210,180,140,0.26))',
      boxShadow: mode === 'light'
        ? '0 5px 14px rgba(93, 52, 27, 0.18)'
        : '0 5px 14px rgba(0, 0, 0, 0.4)',
      transform: 'translateY(-1px)',
    },
    '&:active': {
      transform: 'translateY(0)',
      boxShadow: mode === 'light'
        ? '0 2px 8px rgba(93, 52, 27, 0.14)'
        : '0 2px 8px rgba(0, 0, 0, 0.32)',
    },
  };

  return (
    <>
      <AppBar 
        position="static" 
        color="default" 
        elevation={1} 
        sx={{ 
          zIndex: (theme) => theme.zIndex.drawer + 1,
          borderRadius: 0,
          background: mode === 'light'
            ? 'linear-gradient(180deg, #fbf7ef 0%, #f3eadb 100%)'
            : 'linear-gradient(180deg, #2b2115 0%, #1f180f 100%)',
          borderBottom: `1px solid ${mode === 'light' ? '#cebfa6' : '#5a4734'}`,
          position: 'relative',
          boxShadow: mode === 'light' ? '0 6px 24px rgba(88,57,34,0.12)' : '0 6px 24px rgba(0,0,0,0.35)',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: mode === 'light'
              ? 'linear-gradient(90deg, rgba(160,82,45,0.08), transparent)'
              : 'linear-gradient(90deg, rgba(210,180,140,0.08), transparent)',
            pointerEvents: 'none',
          }
        }}
      >
        <Toolbar sx={{ minHeight: 68, px: { xs: 1.5, sm: 2.25 } }}>
          {onSidebarToggle ? (
            <IconButton
              color="inherit"
              aria-label="打开侧边栏"
              edge="start"
              onClick={onSidebarToggle}
              sx={{
                mr: 1.25,
                ...actionButtonSx,
              }}
            >
              <MenuIcon />
            </IconButton>
          ) : null}

          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography
              variant="h6"
              component="div"
              sx={{
                fontFamily: '"KaiTi", "STKaiti", serif',
                fontWeight: 700,
                letterSpacing: 0.4,
                lineHeight: 1.08,
                background: mode === 'light'
                  ? 'linear-gradient(135deg, #5e2f16, #a24726)'
                  : 'linear-gradient(135deg, #f3d8aa, #e6b26a)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              武林外传 AI 聊天
            </Typography>
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                opacity: 0.72,
                letterSpacing: 1.05,
                color: mode === 'light' ? '#7a5a44' : '#d7c2a4',
                textTransform: 'uppercase',
              }}
            >
              Story Console
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {onNewChat ? (
              <Tooltip title="新对话">
                <IconButton
                  color="primary"
                  onClick={onNewChat}
                  aria-label="新对话"
                  sx={actionButtonSx}
                >
                  <AddIcon />
                </IconButton>
              </Tooltip>
            ) : null}

            <Tooltip title={mode === 'dark' ? "切换到亮色模式" : "切换到暗色模式"}>
              <IconButton 
                onClick={toggleMode} 
                color="inherit"
                aria-label={mode === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
                sx={actionButtonSx}
              >
                {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
              </IconButton>
            </Tooltip>

            <Tooltip title="设置">
              <IconButton
                color="inherit"
                onClick={() => onOpenControlCenter?.()}
                aria-label="打开设置菜单"
                sx={actionButtonSx}
              >
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>
    </>
  );
};

export default Header;
