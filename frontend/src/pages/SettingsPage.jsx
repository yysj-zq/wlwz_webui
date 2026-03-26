import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
} from '@mui/material';
import { useMediaQuery } from '@mui/material';
import { useTheme } from '../contexts/ThemeContext';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8081';

const SettingsPage = ({
  embedded = false,
  currentUser,
  onLoginClick,
  onLogout,
  userRole,
  setUserRole,
  assistantRole,
  setAssistantRole,
  streamingEnabled,
  setStreamingEnabled,
  rolesConfig,
}) => {
  const { theme, mode, toggleMode } = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const roleList = rolesConfig?.roles?.map((r) => ({
    name: r.name,
    avatar: r.avatar_url ? (r.avatar_url.startsWith('http') ? r.avatar_url : `${API_BASE}${r.avatar_url}`) : '',
  })) || [];

  return (
    <Box
      sx={{
        p: embedded ? 1.5 : 2,
        flex: 1,
        overflow: 'auto',
        background: embedded
          ? 'transparent'
          : theme.palette.mode === 'light'
            ? 'linear-gradient(135deg, #f6f9ff 0%, #edf3ff 100%)'
            : 'linear-gradient(135deg, #0b0c0f 0%, #111114 100%)',
      }}
    >
      <Paper
        sx={{
          p: 3,
          maxWidth: embedded ? 'none' : 980,
          mx: 'auto',
          borderRadius: 3,
          background: theme.palette.mode === 'light'
            ? 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(246,249,255,0.9))'
            : 'linear-gradient(180deg, rgba(20,19,18,0.92), rgba(14,13,12,0.9))',
          boxShadow: theme.palette.mode === 'light'
            ? '0 16px 44px rgba(17, 44, 107, 0.1)'
            : '0 18px 44px rgba(0,0,0,0.42)',
        }}
      >
        <Typography variant="overline" sx={{ opacity: 0.75, letterSpacing: 1.2 }}>
          Preferences
        </Typography>
        <Typography variant="h5" sx={{ mb: 0.5 }}>
          系统设置
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          管理账号状态、会话偏好与角色配置。
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 2 }}>
          <Paper sx={{ p: 2, borderRadius: 2, background: theme.palette.mode === 'light' ? 'rgba(245,248,255,0.78)' : 'rgba(19,24,36,0.68)' }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>界面外观</Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={mode === 'dark'}
                  onChange={toggleMode}
                  color="primary"
                />
              }
              label={mode === 'dark' ? '暗色模式' : '亮色模式'}
              sx={{ display: 'block' }}
            />
          </Paper>

          <Paper sx={{ p: 2, borderRadius: 2, background: theme.palette.mode === 'light' ? 'rgba(245,248,255,0.78)' : 'rgba(19,24,36,0.68)' }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>账号状态</Typography>
            {currentUser ? (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                <Typography variant="body2">已登录：{currentUser.email}</Typography>
                <Button size="small" onClick={onLogout}>退出登录</Button>
              </Box>
            ) : (
              <Button size="small" onClick={onLoginClick}>登录 / 注册</Button>
            )}
          </Paper>

          <Paper sx={{ p: 2, borderRadius: 2, background: theme.palette.mode === 'light' ? 'rgba(245,248,255,0.78)' : 'rgba(19,24,36,0.68)' }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>输出策略</Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={streamingEnabled}
                  onChange={(e) => setStreamingEnabled(e.target.checked)}
                  color="primary"
                />
              }
              label="启用流式输出"
              sx={{ display: 'block' }}
            />
          </Paper>
        </Box>

        <Paper sx={{ p: 2, borderRadius: 2, mt: 2, background: theme.palette.mode === 'light' ? 'rgba(245,248,255,0.78)' : 'rgba(19,24,36,0.68)' }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>移动端角色选择</Typography>
          {isMobile ? (
            <>
              <FormControl fullWidth margin="normal">
                <InputLabel id="mobile-user-role-label">你的角色</InputLabel>
                <Select
                  labelId="mobile-user-role-label"
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                  label="你的角色"
                >
                  {(roleList.length ? roleList : [{ name: userRole || '用户' }]).map((role) => (
                    <MenuItem key={role.name} value={role.name}>
                      {role.name}
                    </MenuItem>
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
                  {(roleList.length ? roleList : [{ name: assistantRole || '助手' }]).map((role) => (
                    <MenuItem key={role.name} value={role.name}>
                      {role.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              桌面端请在场景控制台中切换角色。
            </Typography>
          )}
        </Paper>
      </Paper>
    </Box>
  );
};

export default SettingsPage;
