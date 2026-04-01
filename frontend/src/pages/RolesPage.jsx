import React from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { useTheme } from '../contexts/ThemeContext';
import RolesConfig from '../components/RolesConfig';

const RolesPage = ({ embedded = false, rolesConfig, currentUser, onSaved }) => {
  const { theme } = useTheme();

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
            : 'linear-gradient(135deg, #121827 0%, #0f1421 100%)',
      }}
    >
      <Paper
        sx={{
          p: 3,
          maxWidth: embedded ? 'none' : 1100,
          mx: 'auto',
          borderRadius: 3,
          background: theme.palette.mode === 'light'
            ? 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(246,249,255,0.9))'
            : 'linear-gradient(180deg, rgba(21,27,41,0.92), rgba(15,20,33,0.9))',
          boxShadow: theme.palette.mode === 'light'
            ? '0 16px 44px rgba(17, 44, 107, 0.1)'
            : '0 18px 44px rgba(0,0,0,0.42)',
        }}
      >
        <Typography variant="overline" sx={{ opacity: 0.75, letterSpacing: 1.2 }}>
          Role Studio
        </Typography>
        <Typography variant="h5" sx={{ mb: 1 }}>
          角色配置
        </Typography>
        <RolesConfig rolesConfig={rolesConfig} currentUser={currentUser} onSaved={onSaved} />
      </Paper>
    </Box>
  );
};

export default RolesPage;
