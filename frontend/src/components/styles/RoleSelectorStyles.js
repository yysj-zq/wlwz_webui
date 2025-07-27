import {
  AppBar,
  Typography,
  Box,
  Avatar,
  Paper,
  styled
} from '@mui/material';

// 圆形选择器容器样式
export const CircleContainer = styled(Paper)(({ theme }) => ({
  position: 'absolute',
  top: '20%',
  left: '80%',
  transform: 'translate(-50%, -50%)',
  width: '300px',
  height: '300px',
  borderRadius: '50%',

  // 增强的渐变背景
  background: theme.palette.mode === 'dark'
    ? 'linear-gradient(135deg, rgba(25,32,46,0.98) 0%, rgba(37,47,63,0.95) 50%, rgba(45,55,72,0.92) 100%)'
    : 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.95) 50%, rgba(241,245,249,0.92) 100%)',

  // 增强的毛玻璃效果
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',

  // 双重边框效果
  border: `1px solid ${theme.palette.mode === 'dark'
    ? 'rgba(255,255,255,0.15)'
    : 'rgba(0,0,0,0.08)'}`,

  // 内阴影和外阴影组合
  boxShadow: theme.palette.mode === 'dark'
    ? `
      0 8px 32px rgba(0,0,0,0.4),
      0 4px 16px rgba(0,0,0,0.25),
      inset 0 1px 0 rgba(255,255,255,0.1),
      0 0 0 1px rgba(255,255,255,0.05)
    `
    : `
      0 8px 32px rgba(0,0,0,0.12),
      0 4px 16px rgba(0,0,0,0.08),
      inset 0 1px 0 rgba(255,255,255,0.8),
      0 0 0 1px rgba(0,0,0,0.05)
    `,

  zIndex: 1300,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'visible',

  // 添加动画过渡
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',

  // 悬停效果
  '&:hover': {
    transform: 'translate(-50%, -50%) scale(1.02)',
    boxShadow: theme.palette.mode === 'dark'
      ? `
        0 12px 48px rgba(0,0,0,0.5),
        0 6px 24px rgba(0,0,0,0.3),
        inset 0 1px 0 rgba(255,255,255,0.15),
        0 0 0 1px rgba(255,255,255,0.08)
      `
      : `
        0 12px 48px rgba(0,0,0,0.15),
        0 6px 24px rgba(0,0,0,0.1),
        inset 0 1px 0 rgba(255,255,255,0.9),
        0 0 0 1px rgba(0,0,0,0.08)
      `,
  },

  // 活跃状态
  '&:active': {
    transform: 'translate(-50%, -50%) scale(0.98)',
  },

  // 添加微妙的发光效果
  '&::before': {
    content: '""',
    position: 'absolute',
    top: '-2px',
    left: '-2px',
    right: '-2px',
    bottom: '-2px',
    borderRadius: '50%',
    background: theme.palette.mode === 'dark'
      ? 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))'
      : 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(147,51,234,0.2))',
    zIndex: -1,
    opacity: 0,
    transition: 'opacity 0.3s ease',
  },

  '&:hover::before': {
    opacity: 1,
  },

  // 响应式设计
  [theme.breakpoints.down('sm')]: {
    width: '250px',
    height: '250px',
    left: '70%',
  },

  [theme.breakpoints.down('xs')]: {
    width: '200px',
    height: '200px',
    top: '15%',
    left: '60%',
  }
}));


// 中心头像样式
export const CenterAvatar = styled(Avatar)(({ theme, ishovered }) => ({
  width: 80,
  height: 80,
  bottom: 25,
  border: `4px solid ${theme.palette.primary.main}`,
  boxShadow: `0 0 20px ${theme.palette.primary.main}40`,
  zIndex: 10,
  transition: 'all 0.3s ease',
  transform: ishovered ? 'scale(1.1)' : 'scale(1)',
  opacity: ishovered ? 0.9 : 1
}));

// 中心角色信息
export const CenterRoleInfo = styled(Box)(({ theme }) => ({
  position: 'absolute',
  bottom: -40,
  left: '50%',
  transform: 'translateX(-50%)',
  textAlign: 'center',
  zIndex: 10,
  background: `linear-gradient(135deg, ${theme.palette.background.paper}95, ${theme.palette.background.default}85)`,
  backdropFilter: 'blur(10px)',
  padding: '8px 16px',
  borderRadius: '16px',
  border: `1px solid ${theme.palette.divider}40`,
  boxShadow: `0 8px 32px ${theme.palette.common.black}10, 0 2px 8px ${theme.palette.common.black}05`,
  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    transform: 'translateX(-50%) translateY(-2px)',
    boxShadow: `0 12px 40px ${theme.palette.common.black}15, 0 4px 12px ${theme.palette.common.black}08`,
  }
}));

// 外围角色选项样式
export const OuterRoleOption = styled(Box)(({ theme }) => ({
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  cursor: 'pointer',
  transition: 'all 0.3s ease',
  zIndex: 5,
  '&:hover': {
    transform: 'scale(1.2)',
    zIndex: 15
  }
}));

// 外围头像样式
export const OuterAvatar = styled(Avatar)(({ theme, isselected, ishovered }) => ({
  width: 50,
  height: 50,
  border: isselected
    ? `3px solid ${theme.palette.primary.main}`
    : ishovered
      ? `3px solid ${theme.palette.secondary.main}`
      : `2px solid ${theme.palette.divider}`,
  boxShadow: isselected
    ? `0 0 15px ${theme.palette.primary.main}60`
    : ishovered
      ? `0 0 20px ${theme.palette.secondary.main}80`
      : theme.shadows[4],
  transition: 'all 0.3s ease',
  opacity: isselected ? 0.7 : 1,
  '&:hover': {
    boxShadow: `0 0 20px ${theme.palette.primary.main}80`,
    border: `3px solid ${theme.palette.primary.main}`
  }
}));

// 角色名称标签
export const RoleLabel = styled(Typography)(({ theme }) => ({
  fontSize: '10px',
  fontWeight: 500,
  color: theme.palette.text.primary,
  background: theme.palette.background.paper,
  padding: '2px 6px',
  borderRadius: '8px',
  border: `1px solid ${theme.palette.divider}`,
  marginTop: '4px',
  whiteSpace: 'nowrap',
  boxShadow: theme.shadows[2],
  opacity: 0,
  transform: 'translateY(-5px)',
  transition: 'all 0.3s ease',
  '.outer-role-option:hover &': {
    opacity: 1,
    transform: 'translateY(0)'
  }
}));

// 中心角色名称样式
export const CenterRoleName = styled(Typography)(({ theme, ishovered }) => ({
  fontWeight: 700,
  fontSize: '0.875rem',
  background: ishovered
    ? `linear-gradient(135deg, ${theme.palette.secondary.main}, ${theme.palette.secondary.light})`
    : `linear-gradient(135deg, ${theme.palette.text.primary}, ${theme.palette.text.secondary})`,
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  textShadow: ishovered ? `0 0 20px ${theme.palette.secondary.main}30` : 'none',
  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  whiteSpace: 'nowrap',
  letterSpacing: '0.5px',
  lineHeight: 1.2,
  marginBottom: '2px',
  '&:hover': {
    transform: 'scale(1.05)',
    filter: 'brightness(1.2)',
  }
}));

// 中心角色描述样式
export const CenterRoleDescription = styled(Typography)(({ theme, ishovered }) => ({
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 500,
  color: ishovered ? theme.palette.text.secondary : theme.palette.text.disabled,
  opacity: ishovered ? 0.9 : 0.7,
  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  whiteSpace: 'nowrap',
  letterSpacing: '0.3px',
  lineHeight: 1.3,
  fontStyle: 'italic',
  textShadow: `0 1px 2px ${theme.palette.common.black}10`,
  '&:hover': {
    opacity: 1,
    transform: 'translateY(-1px)',
    color: theme.palette.text.primary,
  }
}));

// 头部应用栏样式
export const StyledAppBar = styled(AppBar)(({ theme }) => ({
  zIndex: theme.zIndex.drawer + 1
}));

// 当前头像容器样式
export const CurrentAvatarContainer = styled(Box)(({ theme, isselectoropen }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(1, 2),
  borderRadius: theme.spacing(3),
  border: `2px solid ${isselectoropen ? theme.palette.primary.main : theme.palette.divider}`,
  cursor: 'pointer',
  transition: 'all 0.3s ease',
  background: isselectoropen
    ? `linear-gradient(135deg, ${theme.palette.primary.main}20, ${theme.palette.primary.main}10)`
    : 'transparent',
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
    borderColor: theme.palette.primary.main,
    transform: 'scale(1.02)'
  }
}));

// 当前头像样式
export const CurrentAvatar = styled(Avatar)(({ theme, isselectoropen }) => ({
  width: 36,
  height: 36,
  marginRight: theme.spacing(1.5),
  border: `2px solid ${isselectoropen ? theme.palette.primary.main : 'transparent'}`,
  transition: 'all 0.3s ease'
}));

// 轮盘容器样式
export const SelectorContainer = styled(Box)(({ theme, isselectoropen, position = 'bottom' }) => ({
  position: 'absolute',
  top: position === 'top' ? 200 : -200,
  left: position === 'top' ? -150: 50,
  width: '100%',
  height: '100%',
  pointerEvents: isselectoropen ? 'auto' : 'none',
  zIndex: 1200
}));
