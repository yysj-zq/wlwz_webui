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
  const { theme } = useTheme();
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
            ? 'linear-gradient(135deg, #f6f2e8 0%, #ece5d8 100%)'
            : 'linear-gradient(135deg, #2d2418 0%, #221a11 100%)',
      }}
    >
      <Paper
        sx={{
          p: 3,
          maxWidth: embedded ? 'none' : 980,
          mx: 'auto',
          borderRadius: 3,
          border: `1px solid ${theme.palette.divider}`,
          background: theme.palette.mode === 'light'
            ? 'linear-gradient(180deg, rgba(255, 252, 245, 0.9), rgba(248, 241, 228, 0.95))'
            : 'linear-gradient(180deg, rgba(61, 47, 25, 0.9), rgba(45, 34, 19, 0.95))',
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
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, background: 'transparent' }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>账号状态</Typography>
            {currentUser ? (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                <Typography variant="body2">已登录：{currentUser.email}</Typography>
                <Button size="small" onClick={onLogout}>退出登录</Button>
              </Box>
            ) : (
              <Button variant="outlined" size="small" onClick={onLoginClick}>登录 / 注册</Button>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, background: 'transparent' }}>
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

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mt: 2, background: 'transparent' }}>
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
