import { styled } from '@mui/material/styles';
import { Box, Avatar } from '@mui/material';

export const StageShell = styled(Box)(({ theme }) => ({
  flex: 1,
  width: '100%',
  minWidth: 0,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  maxWidth: 1260,
  margin: '0 auto',
  padding: theme.spacing(1.2, 2, 1.4),
  borderRadius: theme.spacing(3),
  background: 'transparent',
  boxShadow: 'none',
  [theme.breakpoints.down('md')]: {
    borderRadius: 0,
    padding: theme.spacing(0.8, 0.35, 0.35),
  },
}));

export const ScriptColumn = styled(Box)(({ theme }) => ({
  minWidth: 0,
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
}));

export const DirectorPanel = styled(Box)(({ theme }) => ({
  borderRadius: theme.spacing(2),
  padding: theme.spacing(1.3),
  background:
    theme.palette.mode === 'light'
      ? 'rgba(255,255,255,0.7)'
      : 'rgba(20,19,18,0.56)',
  backdropFilter: 'blur(12px)',
  marginTop: theme.spacing(1.2),
}));

export const RoleBioCard = styled(Box)(({ theme }) => ({
  borderRadius: theme.spacing(1.2),
  padding: theme.spacing(1.1, 1.2),
  background:
    theme.palette.mode === 'light'
      ? 'rgba(245,248,255,0.72)'
      : 'rgba(16,15,14,0.56)',
  transition: 'opacity 140ms ease',
  '&:hover': {
    opacity: 0.96,
  },
}));

export const ComposerCard = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(1),
  borderRadius: theme.spacing(2),
  padding: theme.spacing(1.2),
  background: 'transparent',
  backdropFilter: 'none',
  position: 'sticky',
  bottom: 0,
  zIndex: 5,
  boxShadow: 'none',
  transition: 'background-color 160ms ease',
  '&:hover': {
    background: theme.palette.mode === 'light' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.04)',
  },
}));

export const SceneBanner = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(0.9),
  padding: theme.spacing(1.25, 1.8),
  borderRadius: theme.spacing(1.8),
  background: 'transparent',
  boxShadow: 'none',
}));

export const MessageContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  width: 'fit-content',
  maxWidth: 'min(760px, 88%)',
  marginBottom: theme.spacing(0.65),
  padding: theme.spacing(0.2, 0.3),
  borderRadius: 0,
  backgroundColor: 'transparent',
  position: 'relative',
  boxShadow: 'none',
  transition: 'opacity 120ms ease',
  '&:hover': {
    opacity: 0.985,
  },
  '& .MuiAvatar-root': {
    marginRight: theme.spacing(0.6),
  },
  '&.message-user': {
    alignSelf: 'flex-end',
    marginRight: 'clamp(10px, 3vw, 42px)',
    flexDirection: 'row-reverse',
    textAlign: 'right',
    '& .MuiAvatar-root': {
      marginRight: 0,
      marginLeft: theme.spacing(0.6),
    },
  },
  '&.message-assistant': {
    alignSelf: 'flex-start',
    marginLeft: 'clamp(10px, 3vw, 42px)',
  },
  '&.message-scene': {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 980,
    justifyContent: 'center',
    backgroundColor: 'transparent',
    boxShadow: 'none',
  },
}));

export const StyledAvatar = styled(Avatar)(({ theme }) => ({
  width: 42,
  height: 42,
  background: theme.palette.mode === 'light'
    ? 'linear-gradient(180deg, rgba(255,255,255,0.66), rgba(209,224,255,0.3))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.16), rgba(214,178,94,0.18))',
  color: theme.palette.primary.contrastText,
  backdropFilter: 'blur(6px)',
  boxShadow: theme.palette.mode === 'light'
    ? '0 6px 16px rgba(12, 32, 78, 0.14)'
    : '0 6px 16px rgba(0, 0, 0, 0.36)',
}));