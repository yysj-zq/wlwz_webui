import React, { useState } from 'react';
import { 
  Box, 
  Drawer, 
  List, 
  ListItem, 
  ListItemButton,
  ListItemText, 
  ListItemIcon, 
  Typography, 
  IconButton,
  Button,
  InputBase,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  useTheme as useMuiTheme
} from '@mui/material';
import { styled } from '@mui/material/styles';
import ChatIcon from '@mui/icons-material/Chat';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import { format } from 'date-fns';

// 侧边栏宽度
const drawerWidth = 280;

// 自定义侧边栏样式
const StyledDrawer = styled(Drawer)(({ theme }) => ({
  width: drawerWidth,
  flexShrink: 0,
  '& .MuiDrawer-paper': {
    width: drawerWidth,
    boxSizing: 'border-box',
    borderRadius: 20,
    top: 12,
    left: 12,
    height: 'calc(100% - 24px)',
    backgroundColor: 'transparent',
    backgroundImage: theme.palette.mode === 'light'
      ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(244, 248, 255, 0.78))'
      : 'linear-gradient(180deg, rgba(20, 19, 18, 0.92), rgba(20, 19, 18, 0.76))',
    backdropFilter: 'blur(18px)',
    position: 'relative',
    boxShadow: theme.palette.mode === 'light'
      ? '0 14px 40px rgba(13, 34, 80, 0.14)'
      : '0 20px 44px rgba(0, 0, 0, 0.45)',
    border: theme.palette.mode === 'dark' ? '1px solid rgba(255,255,255,0.10)' : 'none',
    outline: theme.palette.mode === 'dark' ? '1px solid rgba(214,178,94,0.06)' : 'none',
    outlineOffset: theme.palette.mode === 'dark' ? '-1px' : undefined,
  },
}));

// 侧边栏移动版本样式
const MobileDrawer = styled(Drawer)(({ theme }) => ({
  '& .MuiDrawer-paper': {
    width: drawerWidth,
    boxSizing: 'border-box',
    borderRadius: 20,
    top: 12,
    left: 12,
    height: 'calc(100% - 24px)',
    backgroundColor: 'transparent',
    backgroundImage: theme.palette.mode === 'light'
      ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(244, 248, 255, 0.78))'
      : 'linear-gradient(180deg, rgba(20, 19, 18, 0.92), rgba(20, 19, 18, 0.76))',
    backdropFilter: 'blur(18px)',
    position: 'relative',
    boxShadow: theme.palette.mode === 'light'
      ? '0 14px 40px rgba(13, 34, 80, 0.14)'
      : '0 20px 44px rgba(0, 0, 0, 0.45)',
    border: theme.palette.mode === 'dark' ? '1px solid rgba(255,255,255,0.10)' : 'none',
    outline: theme.palette.mode === 'dark' ? '1px solid rgba(214,178,94,0.06)' : 'none',
    outlineOffset: theme.palette.mode === 'dark' ? '-1px' : undefined,
  },
}));

const Sidebar = ({
  open,
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onUpdateTitle,
  onClose,
  isMobile
}) => {
  const muiTheme = useMuiTheme();
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState(null);

  const handleEditStart = (id, title) => {
    setEditingId(id);
    setEditingTitle(title);
  };

  const handleEditSave = () => {
    if (editingTitle.trim()) {
      onUpdateTitle(editingId, editingTitle);
    }
    setEditingId(null);
  };

  const handleEditCancel = () => {
    setEditingId(null);
  };

  const handleDeleteClick = (id, event) => {
    event.stopPropagation();
    setConversationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (conversationToDelete) {
      onDeleteConversation(conversationToDelete);
    }
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  };

  const iconActionSx = {
    width: 34,
    height: 34,
    background: muiTheme.palette.mode === 'light'
      ? 'linear-gradient(180deg, rgba(255,255,255,0.76), rgba(210,224,255,0.52))'
      : 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(214,178,94,0.18))',
    boxShadow: muiTheme.palette.mode === 'light'
      ? '0 2px 8px rgba(93, 52, 27, 0.14)'
      : '0 2px 8px rgba(0, 0, 0, 0.32)',
    transition: 'transform 160ms ease, background 160ms ease, box-shadow 160ms ease',
    '&:hover': {
      background: muiTheme.palette.mode === 'light'
        ? 'linear-gradient(180deg, rgba(255,255,255,0.88), rgba(210,224,255,0.66))'
        : 'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(214,178,94,0.26))',
      boxShadow: muiTheme.palette.mode === 'light'
        ? '0 5px 14px rgba(93, 52, 27, 0.12)'
        : '0 5px 14px rgba(0, 0, 0, 0.3)',
      transform: 'translateY(-1px)',
    },
    '&:active': {
      transform: 'translateY(0)',
    },
  };

  const primaryPillSx = {
    borderRadius: 999,
    py: 1.05,
    border: 'none',
    backgroundColor: muiTheme.palette.primary.main,
    color: muiTheme.palette.primary.contrastText,
    boxShadow: muiTheme.palette.mode === 'light'
      ? '0 4px 12px rgba(95, 45, 22, 0.2)'
      : '0 4px 12px rgba(0, 0, 0, 0.32)',
    letterSpacing: 0.3,
    transition: 'transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease',
    '&:hover': {
      backgroundColor: muiTheme.palette.primary.light,
      boxShadow: muiTheme.palette.mode === 'light'
        ? '0 6px 16px rgba(95, 45, 22, 0.24)'
        : '0 6px 16px rgba(0, 0, 0, 0.38)',
      transform: 'translateY(-1px)',
    },
    '&:active': {
      transform: 'translateY(0)',
      boxShadow: muiTheme.palette.mode === 'light'
        ? '0 3px 10px rgba(95, 45, 22, 0.2)'
        : '0 3px 10px rgba(0, 0, 0, 0.32)',
    },
  };

  const drawerContent = (
    <>
      <Box sx={{ p: 2, pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="overline" sx={{ opacity: 0.75, letterSpacing: 1 }}>
            Conversation Hub
          </Typography>
          <Typography variant="h6" component="div">
          对话列表
          </Typography>
        </Box>
        {isMobile && (
          <IconButton
            onClick={() => onClose?.()}
            size="small"
            aria-label="关闭侧边栏"
            sx={iconActionSx}
          >
            <CloseIcon />
          </IconButton>
        )}
      </Box>

      <Box sx={{ p: 2 }}>
        <Button 
          variant="contained" 
          fullWidth 
          startIcon={<AddIcon />}
          onClick={onNewChat}
          sx={primaryPillSx}
        >
          新对话
        </Button>
      </Box>

      <List sx={{ overflow: 'auto', flex: 1 }}>
        {conversations.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              没有对话记录
            </Typography>
          </Box>
        ) : (
          conversations.map((conversation) => (
            <ListItem
              key={conversation.id}
              disablePadding
              secondaryAction={
                editingId !== conversation.id ? (
                  <Box>
                    <Tooltip title="编辑标题">
                      <IconButton 
                        edge="end" 
                        size="small"
                        aria-label="编辑对话标题"
                        sx={iconActionSx}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditStart(conversation.id, conversation.title);
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除对话">
                      <IconButton 
                        edge="end" 
                        size="small" 
                        aria-label="删除对话"
                        sx={iconActionSx}
                        onClick={(e) => handleDeleteClick(conversation.id, e)}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ) : (
                  <Box>
                    <Tooltip title="保存">
                      <IconButton edge="end" size="small" onClick={handleEditSave} aria-label="保存对话标题" sx={iconActionSx}>
                        <CheckIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="取消">
                      <IconButton edge="end" size="small" onClick={handleEditCancel} aria-label="取消编辑对话标题" sx={iconActionSx}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )
              }
            >
              <ListItemButton
                selected={conversation.id === currentConversationId}
                onClick={() => onSelectConversation(conversation.id)}
                sx={{
                  borderRadius: '14px',
                  m: 0.5,
                  '&:hover': {
                    backgroundColor: muiTheme.palette.mode === 'light'
                      ? `${muiTheme.palette.primary.main}14`
                      : `${muiTheme.palette.primary.main}26`,
                  },
                  '&.Mui-selected': {
                    backgroundColor: muiTheme.palette.mode === 'light'
                      ? `${muiTheme.palette.primary.main}1f`
                      : `${muiTheme.palette.primary.main}2e`,
                  },
                  '&.Mui-selected:hover': {
                    backgroundColor: muiTheme.palette.mode === 'light'
                      ? `${muiTheme.palette.primary.main}2b`
                      : `${muiTheme.palette.primary.main}40`,
                  },
                }}
              >
                <ListItemIcon>
                  <ChatIcon color={conversation.id === currentConversationId ? 'primary' : 'inherit'} />
                </ListItemIcon>
                {editingId === conversation.id ? (
                  <InputBase
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    autoFocus
                    fullWidth
                    inputProps={{
                      'aria-label': '编辑对话标题',
                      name: 'conversation-title',
                      autoComplete: 'off',
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleEditSave();
                      } else if (e.key === 'Escape') {
                        handleEditCancel();
                      }
                    }}
                  />
                ) : (
                  <ListItemText 
                    primary={conversation.title} 
                    secondary={format(new Date(conversation.createdAt), 'yyyy-MM-dd HH:mm')}
                    primaryTypographyProps={{
                      noWrap: true,
                      style: { maxWidth: '150px' }
                    }}
                  />
                )}
              </ListItemButton>
            </ListItem>
          ))
        )}
      </List>

      <Dialog
        open={deleteDialogOpen}
        onClose={handleCancelDelete}
      >
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <DialogContentText>
            你确定要删除这个对话吗？此操作无法撤销。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>取消</Button>
          <Button onClick={handleConfirmDelete} color="error">
            删除
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );

  const DrawerComponent = isMobile ? MobileDrawer : StyledDrawer;
  return (
    <DrawerComponent
      variant="temporary"
      open={open}
      onClose={() => onClose?.()}
      ModalProps={{
        keepMounted: true,
      }}
    >
      {drawerContent}
    </DrawerComponent>
  );
};

export default Sidebar;
