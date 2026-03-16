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
  Divider,
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
    borderRadius: 0,
    backgroundColor: theme.palette.background.sidebar,
    borderRight: `1px solid ${theme.palette.divider}`,
    backgroundImage: theme.palette.mode === 'light'
      ? 'linear-gradient(180deg, rgba(255, 252, 245, 0.9), rgba(248, 241, 228, 0.95))'
      : 'linear-gradient(180deg, rgba(61, 47, 25, 0.9), rgba(45, 34, 19, 0.95))',
    position: 'relative',
  },
}));

// 侧边栏移动版本样式
const MobileDrawer = styled(Drawer)(({ theme }) => ({
  '& .MuiDrawer-paper': {
    width: drawerWidth,
    boxSizing: 'border-box',
    borderRadius: 0,
    backgroundColor: theme.palette.background.sidebar,
    backgroundImage: theme.palette.mode === 'light'
      ? 'linear-gradient(180deg, rgba(255, 252, 245, 0.9), rgba(248, 241, 228, 0.95))'
      : 'linear-gradient(180deg, rgba(61, 47, 25, 0.9), rgba(45, 34, 19, 0.95))',
    position: 'relative',
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
    border: muiTheme.palette.mode === 'light'
      ? '1px solid rgba(122, 67, 36, 0.22)'
      : '1px solid rgba(226, 190, 141, 0.25)',
    background: muiTheme.palette.mode === 'light'
      ? 'linear-gradient(180deg, rgba(255,255,255,0.62), rgba(160,82,45,0.14))'
      : 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(210,180,140,0.18))',
    boxShadow: muiTheme.palette.mode === 'light'
      ? '0 2px 8px rgba(93, 52, 27, 0.14)'
      : '0 2px 8px rgba(0, 0, 0, 0.32)',
    transition: 'transform 160ms ease, background 160ms ease, box-shadow 160ms ease',
    '&:hover': {
      background: muiTheme.palette.mode === 'light'
        ? 'linear-gradient(180deg, rgba(255,255,255,0.72), rgba(160,82,45,0.22))'
        : 'linear-gradient(180deg, rgba(255,255,255,0.14), rgba(210,180,140,0.26))',
      boxShadow: muiTheme.palette.mode === 'light'
        ? '0 5px 14px rgba(93, 52, 27, 0.18)'
        : '0 5px 14px rgba(0, 0, 0, 0.4)',
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
    backgroundColor: muiTheme.palette.mode === 'light' ? '#ae4f28' : '#c7a775',
    color: muiTheme.palette.mode === 'light' ? '#fffaf4' : '#2a1d12',
    boxShadow: muiTheme.palette.mode === 'light'
      ? '0 4px 12px rgba(95, 45, 22, 0.2)'
      : '0 4px 12px rgba(0, 0, 0, 0.32)',
    letterSpacing: 0.3,
    transition: 'transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease',
    '&:hover': {
      backgroundColor: muiTheme.palette.mode === 'light' ? '#b85a32' : '#d2b485',
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
            onClick={() => onSelectConversation(currentConversationId)}
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

      <Divider />

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
                  border: `1px solid ${muiTheme.palette.divider}`,
                  '&:hover': {
                    backgroundColor: muiTheme.palette.mode === 'light'
                      ? `${muiTheme.palette.primary.main}14`
                      : `${muiTheme.palette.primary.main}26`,
                  },
                  '&.Mui-selected': {
                    backgroundColor: muiTheme.palette.mode === 'light'
                      ? `${muiTheme.palette.primary.main}1f`
                      : `${muiTheme.palette.primary.main}2e`,
                    borderColor: `${muiTheme.palette.primary.main}66`,
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

  return isMobile ? (
    <MobileDrawer
      variant="temporary"
      open={open}
      ModalProps={{
        keepMounted: true,
      }}
    >
      {drawerContent}
    </MobileDrawer>
  ) : (
    <StyledDrawer
      variant="persistent"
      open={open}
    >
      {drawerContent}
    </StyledDrawer>
  );
};

export default Sidebar;
