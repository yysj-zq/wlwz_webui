import React from 'react';
import { Box, Paper, Typography } from '@mui/material';
import RolesConfig from '../components/RolesConfig';

const RolesPage = ({ rolesConfig, currentUser, onSaved }) => {
  return (
    <Box sx={{ p: 2, flex: 1, overflow: 'auto' }}>
      <Paper sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          角色配置
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          统一管理默认角色与自定义角色，包括提示词、语音参数与头像资源。
        </Typography>
        <RolesConfig rolesConfig={rolesConfig} currentUser={currentUser} onSaved={onSaved} />
      </Paper>
    </Box>
  );
};

export default RolesPage;
