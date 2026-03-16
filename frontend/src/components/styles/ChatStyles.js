import { styled } from '@mui/material/styles';
import { Box, Avatar } from '@mui/material';

export const StageShell = styled(Box)(({ theme }) => ({
  flex: 1,
  width: '100%',
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 320px',
  gap: theme.spacing(2),
  height: '100%',
  padding: theme.spacing(2),
  background:
    theme.palette.mode === 'light'
      ? 'linear-gradient(135deg, #f6f2e8 0%, #ece5d8 100%)'
      : 'linear-gradient(135deg, #2d2418 0%, #221a11 100%)',
  [theme.breakpoints.down('lg')]: {
    gridTemplateColumns: '1fr',
  },
}));

export const ScriptColumn = styled(Box)(({ theme }) => ({
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  borderRadius: theme.spacing(3),
  border: `1px solid ${theme.palette.divider}`,
  background:
    theme.palette.mode === 'light'
      ? 'linear-gradient(180deg, rgba(255, 252, 245, 0.9), rgba(248, 241, 228, 0.95))'
      : 'linear-gradient(180deg, rgba(61, 47, 25, 0.9), rgba(45, 34, 19, 0.95))',
  boxShadow:
    theme.palette.mode === 'light'
      ? '0 10px 40px rgba(88, 57, 34, 0.12)'
      : '0 10px 40px rgba(0, 0, 0, 0.35)',
  overflow: 'hidden',
}));

export const DirectorPanel = styled(Box)(({ theme }) => ({
  borderRadius: theme.spacing(3),
  border: `1px solid ${theme.palette.divider}`,
  padding: theme.spacing(2),
  background:
    theme.palette.mode === 'light'
      ? 'linear-gradient(180deg, rgba(255, 250, 241, 0.95), rgba(245, 236, 219, 0.95))'
      : 'linear-gradient(180deg, rgba(58, 43, 24, 0.95), rgba(44, 34, 18, 0.95))',
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(1.5),
  overflow: 'auto',
}));

export const RoleBioCard = styled(Box)(({ theme }) => ({
  borderRadius: theme.spacing(2),
  border: `1px solid ${theme.palette.divider}`,
  padding: theme.spacing(1.25),
  background:
    theme.palette.mode === 'light'
      ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(246, 239, 226, 0.9))'
      : 'linear-gradient(180deg, rgba(73, 57, 34, 0.82), rgba(58, 44, 26, 0.9))',
  boxShadow:
    theme.palette.mode === 'light'
      ? '0 6px 20px rgba(88, 57, 34, 0.08)'
      : '0 6px 20px rgba(0, 0, 0, 0.28)',
}));

export const ComposerCard = styled(Box)(({ theme }) => ({
  borderTop: `1px solid ${theme.palette.divider}`,
  padding: theme.spacing(1.5, 2),
  background:
    theme.palette.mode === 'light'
      ? 'rgba(255, 248, 236, 0.9)'
      : 'rgba(53, 42, 24, 0.9)',
}));

export const SceneBanner = styled(Box)(({ theme }) => ({
  margin: theme.spacing(2, 2, 1),
  padding: theme.spacing(1.25, 1.5),
  borderRadius: theme.spacing(2),
  border: `1px dashed ${theme.palette.divider}`,
  background:
    theme.palette.mode === 'light'
      ? 'rgba(160, 82, 45, 0.08)'
      : 'rgba(210, 180, 140, 0.12)',
}));

export const MessageContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  marginBottom: theme.spacing(2),
  padding: theme.spacing(1.5, 1.75),
  borderRadius: theme.spacing(2.5),
  backgroundColor: 'transparent',
  position: 'relative',
  boxShadow: theme.palette.mode === 'light'
    ? `0 4px 20px ${theme.palette.divider}35`
    : `0 4px 20px ${theme.palette.divider}65`,
  '&.message-user': {
    backgroundColor:
      theme.palette.mode === 'light'
        ? `${theme.palette.primary.main}10`
        : `${theme.palette.primary.main}22`,
    border: `1px solid ${theme.palette.primary.main}50`,
    marginLeft: theme.spacing(5),
  },
  '&.message-assistant': {
    backgroundColor:
      theme.palette.mode === 'light'
        ? `${theme.palette.background.paper}dd`
        : `${theme.palette.background.paper}99`,
    border: `1px solid ${theme.palette.secondary.main}50`,
    marginRight: theme.spacing(5),
  },
  '&.message-scene': {
    justifyContent: 'center',
    backgroundColor: `${theme.palette.background.paper}66`,
    border: `1px dashed ${theme.palette.divider}`,
    boxShadow: 'none'
  }
}));

export const StyledAvatar = styled(Avatar)(({ theme }) => ({
  width: 42,
  height: 42,
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.primary.contrastText,
  marginRight: theme.spacing(1.5),
  border: `1px solid ${theme.palette.divider}`,
}));