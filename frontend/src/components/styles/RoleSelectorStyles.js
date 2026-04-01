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
  position: 'relative',
  width: '300px',
  height: '300px',
  borderRadius: '50%',

  // 武林外传主题渐变背景
  background: theme.palette.mode === 'dark'
    ? `radial-gradient(circle at 30% 30%, ${theme.palette.background.paper}F0, ${theme.palette.background.default}F0), 
       repeating-conic-gradient(from 0deg at 50% 50%, ${theme.palette.divider}20 0deg 10deg, transparent 10deg 20deg)`
    : `radial-gradient(circle at 30% 30%, ${theme.palette.background.paper}F5, ${theme.palette.background.default}F5), 
       repeating-conic-gradient(from 0deg at 50% 50%, ${theme.palette.divider}15 0deg 10deg, transparent 10deg 20deg)`,

  // 武林外传主题毛玻璃效果
  backdropFilter: 'blur(12px) saturate(120%)',
  WebkitBackdropFilter: 'blur(12px) saturate(120%)',

  // 武林外传主题边框
  border: 'none',

  // 武林外传主题阴影
  boxShadow: theme.palette.mode === 'dark'
    ? `
      0 8px 32px ${theme.palette.background.default}60,
      0 4px 16px ${theme.palette.background.default}30,
      inset 0 1px 0 ${theme.palette.background.paper}30,
      0 0 0 1px ${theme.palette.divider}30
    `
    : `
      0 8px 32px ${theme.palette.primary.main}30,
      0 4px 16px ${theme.palette.primary.main}15,
      inset 0 1px 0 ${theme.palette.background.paper}60,
      0 0 0 1px ${theme.palette.primary.main}15
    `,

  zIndex: 1300,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'visible',

  // 添加动画过渡
  transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1)',

  // 悬停效果
  '&:hover': {
    transform: 'scale(1.02)',
    boxShadow: theme.palette.mode === 'dark'
      ? `
        0 12px 48px ${theme.palette.background.default}80,
        0 6px 24px ${theme.palette.background.default}40,
        inset 0 1px 0 ${theme.palette.background.paper}40,
        0 0 0 1px ${theme.palette.divider}40
      `
      : `
        0 12px 48px ${theme.palette.primary.main}45,
        0 6px 24px ${theme.palette.primary.main}25,
        inset 0 1px 0 ${theme.palette.background.paper}80,
        0 0 0 1px ${theme.palette.primary.main}25
      `,
  },

  // 活跃状态
  '&:active': {
    transform: 'scale(0.98)',
  },

  // 添加武林外传主题发光效果
  '&::before': {
    content: '""',
    position: 'absolute',
    top: '-2px',
    left: '-2px',
    right: '-2px',
    bottom: '-2px',
    borderRadius: '50%',
    background: theme.palette.mode === 'dark'
      ? `linear-gradient(135deg, ${theme.palette.secondary.main}30, ${theme.palette.primary.main}30)`
      : `linear-gradient(135deg, ${theme.palette.secondary.main}20, ${theme.palette.primary.main}20)`,
    zIndex: -1,
    opacity: 0,
    transition: 'opacity 0.3s ease',
  },

  '&:hover::before': {
    opacity: 0.7,
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '&:hover': {
      transform: 'none',
    },
    '&:active': {
      transform: 'none',
    },
  },

  // 响应式设计
  [theme.breakpoints.down('sm')]: {
    width: '250px',
    height: '250px',
  }
}));


// 中心头像样式
export const CenterAvatar = styled(Avatar)(({ theme, ishovered }) => ({
  width: 80,
  height: 80,
  bottom: 25,
  boxShadow: `0 0 20px ${theme.palette.primary.main}40`,
  zIndex: 10,
  transition: 'transform 0.3s ease, opacity 0.3s ease',
  transform: ishovered ? 'scale(1.1)' : 'scale(1)',
  opacity: ishovered ? 0.9 : 1,
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    transform: 'scale(1)',
  },
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
  boxShadow: `0 8px 32px ${theme.palette.common.black}10, 0 2px 8px ${theme.palette.common.black}05`,
  transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    transform: 'translateX(-50%) translateY(-2px)',
    boxShadow: `0 12px 40px ${theme.palette.common.black}15, 0 4px 12px ${theme.palette.common.black}08`,
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '&:hover': {
      transform: 'translateX(-50%)',
    },
  },
}));

// 外围角色选项样式
export const OuterRoleOption = styled(Box)(({ theme }) => ({
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
  padding: 0,
  transition: 'transform 0.3s ease',
  zIndex: 5,
  '&:focus-visible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: '4px',
    borderRadius: '12px',
  },
  '&:hover': {
    transform: 'scale(1.2)',
    zIndex: 15
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '&:hover': {
      transform: 'none',
    },
  },
}));

// 外围头像样式
export const OuterAvatar = styled(Avatar)(({ theme, isselected, ishovered }) => ({
  width: 50,
  height: 50,
  boxShadow: isselected
    ? `0 0 15px ${theme.palette.primary.main}60`
    : ishovered
      ? `0 0 20px ${theme.palette.secondary.main}80`
      : theme.shadows[4],
  transition: 'border-color 0.3s ease, box-shadow 0.3s ease, opacity 0.3s ease',
  opacity: isselected ? 0.7 : 1,
  '&:hover': {
    boxShadow: `0 0 20px ${theme.palette.primary.main}80`,
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
}));

// 角色名称标签
export const RoleLabel = styled(Typography)(({ theme }) => ({
  fontSize: '10px',
  fontWeight: 500,
  color: theme.palette.text.primary,
  background: theme.palette.background.paper,
  padding: '2px 6px',
  borderRadius: '8px',
  marginTop: '4px',
  whiteSpace: 'nowrap',
  boxShadow: theme.shadows[2],
  opacity: 0,
  transform: 'translateY(-5px)',
  transition: 'opacity 0.3s ease, transform 0.3s ease',
  '.outer-role-option:hover &': {
    opacity: 1,
    transform: 'translateY(0)'
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    transform: 'translateY(0)',
  },
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
  transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), filter 0.4s cubic-bezier(0.4, 0, 0.2, 1), text-shadow 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  whiteSpace: 'nowrap',
  letterSpacing: '0.5px',
  lineHeight: 1.2,
  marginBottom: '2px',
  '&:hover': {
    transform: 'scale(1.05)',
    filter: 'brightness(1.2)',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '&:hover': {
      transform: 'none',
      filter: 'none',
    },
  },
}));

// 中心角色描述样式
export const CenterRoleDescription = styled(Typography)(({ theme, ishovered }) => ({
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 500,
  color: ishovered ? theme.palette.text.secondary : theme.palette.text.disabled,
  opacity: ishovered ? 0.9 : 0.7,
  transition: 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), color 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  whiteSpace: 'nowrap',
  letterSpacing: '0.3px',
  lineHeight: 1.3,
  fontStyle: 'italic',
  textShadow: `0 1px 2px ${theme.palette.common.black}10`,
  '&:hover': {
    opacity: 1,
    transform: 'translateY(-1px)',
    color: theme.palette.text.primary,
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '&:hover': {
      transform: 'none',
    },
  },
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
  cursor: 'pointer',
  backgroundColor: 'transparent',
  appearance: 'none',
  WebkitAppearance: 'none',
  transition: 'background-color 0.3s ease, border-color 0.3s ease, transform 0.3s ease',
  background: isselectoropen
    ? `linear-gradient(135deg, ${theme.palette.primary.main}20, ${theme.palette.primary.main}10)`
    : 'transparent',
  '&:focus-visible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: '2px',
  },
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
    borderColor: theme.palette.primary.main,
    transform: 'scale(1.02)'
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '&:hover': {
      transform: 'none',
    },
  },
}));

// 当前头像样式
export const CurrentAvatar = styled(Avatar)(({ theme, isselectoropen }) => ({
  width: 36,
  height: 36,
  marginRight: theme.spacing(1.5),
  transition: 'border-color 0.3s ease'
}));

// 轮盘容器样式
export const SelectorContainer = styled(Box)(({ theme, isselectoropen, position = 'bottom' }) => ({
  position: 'absolute',
  top: position === 'top' ? 'auto' : `calc(100% + ${theme.spacing(1)})`,
  bottom: position === 'top' ? `calc(100% + ${theme.spacing(1)})` : 'auto',
  left: position === 'top' ? 'auto' : 0,
  right: position === 'top' ? 0 : 'auto',
  width: 'max-content',
  height: 'max-content',
  pointerEvents: isselectoropen ? 'auto' : 'none',
  opacity: isselectoropen ? 1 : 0,
  transform: isselectoropen ? 'translateY(0)' : 'translateY(-4px)',
  transition: 'opacity 0.2s ease, transform 0.2s ease',
  zIndex: 1400,
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    transform: 'none',
  }
}));
