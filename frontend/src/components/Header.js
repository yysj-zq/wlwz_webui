import { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  useMediaQuery,
  Box,
  Button,
} from '@mui/material';
import { useTheme } from '../contexts/ThemeContext';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import MenuIcon from '@mui/icons-material/Menu';
import AddIcon from '@mui/icons-material/Add';
import SettingsIcon from '@mui/icons-material/Settings';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import RoleSelector from './RoleSelector';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8081';

const Header = ({
  onSidebarToggle,
  onNewChat,
  assistantRole,
  setAssistantRole,
  rolesConfig,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isChatPage = location.pathname === '/';
  const roleList = rolesConfig?.roles?.map((r) => ({
    name: r.name,
    avatar: r.avatar_url ? (r.avatar_url.startsWith('http') ? r.avatar_url : `${API_BASE}${r.avatar_url}`) : '',
    description: (r.system_prompt || '').slice(0, 40) + ((r.system_prompt || '').length > 40 ? '…' : ''),
  })) || [];
  const { theme, mode, toggleMode } = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [anchorEl, setAnchorEl] = useState(null);

  const handleSettingsClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleSettingsClose = () => {
    setAnchorEl(null);
  };

  const handleOpenSettingsPage = () => {
    setAnchorEl(null);
    navigate('/settings');
  };

  const handleOpenRolesPage = () => {
    setAnchorEl(null);
    navigate('/roles');
  };

  return (
    <>
      <AppBar 
        position="static" 
        color="default" 
        elevation={1} 
        sx={{ 
          zIndex: (theme) => theme.zIndex.drawer + 1,
          background: mode === 'light' 
            ? 'linear-gradient(135deg, #FFF8DC 0%, #F5F0E6 100%)'
            : 'linear-gradient(135deg, #3D2F19 0%, #2C2213 100%)',
          borderBottom: `1px solid ${mode === 'light' ? '#D7CCC8' : '#5D4E44'}`,
          position: 'relative',
          // 添加装饰性纹理
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: mode === 'light' 
              ? `repeating-linear-gradient(90deg, ${theme.palette.divider}10 0px, ${theme.palette.divider}10 1px, transparent 1px, transparent 20px)`
              : `repeating-linear-gradient(90deg, ${theme.palette.divider}15 0px, ${theme.palette.divider}15 1px, transparent 1px, transparent 20px)`,
            pointerEvents: 'none',
          }
        }}
      >
        <Toolbar>
          {onSidebarToggle ? (
            <IconButton
              color="inherit"
              aria-label="打开侧边栏"
              edge="start"
              onClick={onSidebarToggle}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
          ) : null}

          <Typography 
            variant="h6" 
            component="div" 
            sx={{ 
              flexGrow: 1,
              fontFamily: '"KaiTi", "STKaiti", serif',
              fontWeight: 'bold',
              background: mode === 'light'
                ? 'linear-gradient(135deg, #8B4513, #A0522D)'
                : 'linear-gradient(135deg, #F5DEB3, #FFE4B5)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}
          >
            武林外传AI聊天
          </Typography>

          {!isMobile && assistantRole && setAssistantRole && (
            <RoleSelector 
              assistantRole={assistantRole} 
              setAssistantRole={setAssistantRole} 
              position="top"
              roleList={roleList}
            />
          )}

          {onNewChat ? (
            <Tooltip title="新对话">
              <IconButton 
                color="primary" 
                onClick={onNewChat}
                aria-label="新对话"
                sx={{
                  background: mode === 'light' 
                    ? 'linear-gradient(135deg, #8B451320, #A0522D20)'
                    : 'linear-gradient(135deg, #F5DEB320, #FFE4B520)',
                  '&:hover': {
                    background: mode === 'light' 
                      ? 'linear-gradient(135deg, #8B451330, #A0522D30)'
                      : 'linear-gradient(135deg, #F5DEB330, #FFE4B530)'
                  }
                }}
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
              sx={{
                background: mode === 'light' 
                  ? 'linear-gradient(135deg, #8B451320, #A0522D20)'
                  : 'linear-gradient(135deg, #F5DEB320, #FFE4B520)',
                '&:hover': {
                  background: mode === 'light' 
                    ? 'linear-gradient(135deg, #8B451330, #A0522D30)'
                    : 'linear-gradient(135deg, #F5DEB330, #FFE4B530)'
                }
              }}
            >
              {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
            </IconButton>
          </Tooltip>

          <Tooltip title="设置">
            <IconButton 
              color="inherit" 
              onClick={handleSettingsClick}
              aria-label="打开设置菜单"
              sx={{
                background: mode === 'light' 
                  ? 'linear-gradient(135deg, #8B451320, #A0522D20)'
                  : 'linear-gradient(135deg, #F5DEB320, #FFE4B520)',
                '&:hover': {
                  background: mode === 'light' 
                    ? 'linear-gradient(135deg, #8B451330, #A0522D30)'
                    : 'linear-gradient(135deg, #F5DEB330, #FFE4B530)'
                }
              }}
            >
              <SettingsIcon />
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleSettingsClose}
            sx={{
              '& .MuiPaper-root': {
                background: mode === 'light' 
                  ? 'linear-gradient(135deg, #FFF8DC 0%, #FFE4B5 100%)'
                  : 'linear-gradient(135deg, #A0522D 0%, #8B4513 100%)',
                border: `1px solid ${mode === 'light' ? '#D2B48C' : '#CD853F'}`
              }
            }}
          >
            <MenuItem 
              onClick={handleOpenSettingsPage}
              sx={{
                fontFamily: '"KaiTi", "STKaiti", serif',
                color: location.pathname === '/settings' ? theme.palette.primary.main : 'inherit',
                '&:hover': {
                  background: mode === 'light' 
                    ? 'rgba(139, 69, 19, 0.1)'
                    : 'rgba(245, 222, 179, 0.1)'
                }
              }}
            >
              偏好设置
            </MenuItem>
            <MenuItem 
              onClick={handleOpenRolesPage}
              sx={{
                fontFamily: '"KaiTi", "STKaiti", serif',
                color: location.pathname === '/roles' ? theme.palette.primary.main : 'inherit',
                '&:hover': {
                  background: mode === 'light' 
                    ? 'rgba(139, 69, 19, 0.1)'
                    : 'rgba(245, 222, 179, 0.1)'
                }
              }}
            >
              角色配置
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {!isChatPage ? (
        <Box
          sx={{
            px: 3,
            py: 1,
            borderBottom: `1px solid ${theme.palette.divider}`,
            backgroundColor: theme.palette.background.paper,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography sx={{ fontFamily: '"KaiTi", "STKaiti", serif' }}>
            {location.pathname === '/settings' ? '偏好设置' : '角色配置'}
          </Typography>
          {location.pathname !== '/' ? (
            <Button
              component={RouterLink}
              to="/"
              sx={{
                fontFamily: '"KaiTi", "STKaiti", serif',
                color: theme.palette.primary.main,
                minWidth: 'auto',
                px: 1,
              }}
            >
              返回聊天
            </Button>
          ) : null}
        </Box>
      ) : null}
    </>
  );
};

export default Header;
