import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Switch,
  FormControlLabel,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Menu,
  MenuItem,
  Tooltip,
  useMediaQuery,
  Box,
  Select,
  FormControl,
  InputLabel
} from '@mui/material';
import { useTheme } from '../contexts/ThemeContext';
import MenuIcon from '@mui/icons-material/Menu';
import AddIcon from '@mui/icons-material/Add';
import SettingsIcon from '@mui/icons-material/Settings';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import PersonIcon from '@mui/icons-material/Person';

const Header = ({
  onSidebarToggle,
  onNewChat,
  userRole,
  setUserRole,
  assistantRole,
  setAssistantRole,
  streamingEnabled,
  setStreamingEnabled
}) => {
  const { theme, mode, toggleMode } = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);

  // 预设角色列表示例
  const userRoles = [
    "佟湘玉", "白展堂", "郭芙蓉", "李大嘴", "吕秀才", "莫小贝", "燕小六", "祝无双", "邢育森"
  ];

  const assistantRoles = [
    "佟湘玉", "白展堂", "郭芙蓉", "李大嘴", "吕秀才", "莫小贝", "燕小六", "祝无双", "邢育森"
  ];

  const handleSettingsClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleSettingsClose = () => {
    setAnchorEl(null);
  };

  const handleOpenSettingsDialog = () => {
    setAnchorEl(null);
    setSettingsOpen(true);
  };

  const handleCloseSettingsDialog = () => {
    setSettingsOpen(false);
  };

  return (
    <>
      <AppBar position="static" color="default" elevation={1} sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="打开侧边栏"
            edge="start"
            onClick={onSidebarToggle}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>

          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            武林外传AI聊天
          </Typography>

          {!isMobile && (
            <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
              {/* <FormControl variant="outlined" size="small" sx={{ minWidth: 120, mr: 2 }}>
                <InputLabel id="user-role-label">你的角色</InputLabel>
                <Select
                  labelId="user-role-label"
                  id="user-role"
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                  label="你的角色"
                >
                  {userRoles.map((role) => (
                    <MenuItem key={role} value={role}>{role}</MenuItem>
                  ))}
                </Select>
              </FormControl> */}

              <FormControl variant="outlined" size="small" sx={{ minWidth: 120 }}>
                <InputLabel id="assistant-role-label">AI角色</InputLabel>
                <Select
                  labelId="assistant-role-label"
                  id="assistant-role"
                  value={assistantRole}
                  onChange={(e) => setAssistantRole(e.target.value)}
                  label="AI角色"
                >
                  {assistantRoles.map((role) => (
                    <MenuItem key={role} value={role}>{role}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}

          <Tooltip title="新对话">
            <IconButton color="primary" onClick={onNewChat}>
              <AddIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title={mode === 'dark' ? "切换到亮色模式" : "切换到暗色模式"}>
            <IconButton onClick={toggleMode} color="inherit">
              {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
            </IconButton>
          </Tooltip>

          <Tooltip title="设置">
            <IconButton color="inherit" onClick={handleSettingsClick}>
              <SettingsIcon />
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleSettingsClose}
          >
            <MenuItem onClick={handleOpenSettingsDialog}>偏好设置</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Dialog open={settingsOpen} onClose={handleCloseSettingsDialog}>
        <DialogTitle>设置</DialogTitle>
        <DialogContent>
          {isMobile && (
            <>
              <FormControl fullWidth margin="normal">
                <InputLabel id="mobile-user-role-label">你的角色</InputLabel>
                <Select
                  labelId="mobile-user-role-label"
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                  label="你的角色"
                >
                  {userRoles.map((role) => (
                    <MenuItem key={role} value={role}>{role}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth margin="normal">
                <InputLabel id="mobile-assistant-role-label">AI角色</InputLabel>
                <Select
                  labelId="mobile-assistant-role-label"
                  value={assistantRole}
                  onChange={(e) => setAssistantRole(e.target.value)}
                  label="AI角色"
                >
                  {assistantRoles.map((role) => (
                    <MenuItem key={role} value={role}>{role}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}

          <FormControlLabel
            control={
              <Switch
                checked={streamingEnabled}
                onChange={(e) => setStreamingEnabled(e.target.checked)}
                color="primary"
              />
            }
            label="启用流式输出"
            sx={{ mt: 2, display: 'block' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseSettingsDialog}>关闭</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default Header;
