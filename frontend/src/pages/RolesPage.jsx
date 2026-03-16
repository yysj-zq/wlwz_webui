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
            ? 'linear-gradient(135deg, #f6f2e8 0%, #ece5d8 100%)'
            : 'linear-gradient(135deg, #2d2418 0%, #221a11 100%)',
      }}
    >
      <Paper
        sx={{
          p: 3,
          maxWidth: embedded ? 'none' : 1100,
          mx: 'auto',
          borderRadius: 3,
          border: `1px solid ${theme.palette.divider}`,
          background: theme.palette.mode === 'light'
            ? 'linear-gradient(180deg, rgba(255, 252, 245, 0.9), rgba(248, 241, 228, 0.95))'
            : 'linear-gradient(180deg, rgba(61, 47, 25, 0.9), rgba(45, 34, 19, 0.95))',
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
