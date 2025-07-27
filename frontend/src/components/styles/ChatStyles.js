import {
  Avatar,
  styled
} from '@mui/material';

// 当前头像样式
export const CurrentAvatar = styled(Avatar)(({ theme, isselectoropen }) => ({
  width: 36,
  height: 36,
  marginRight: theme.spacing(1.5),
  border: `2px solid ${isselectoropen ? theme.palette.primary.main : 'transparent'}`,
  transition: 'all 0.3s ease'
}));