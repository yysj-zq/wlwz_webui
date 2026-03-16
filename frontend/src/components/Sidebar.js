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
    backgroundColor: theme.palette.background.sidebar,
    borderRight: `1px solid ${theme.palette.divider}`,
    // 添加武林外传主题纹理背景
    backgroundImage: theme.palette.mode === 'light' 
      ? `radial-gradient(circle, ${theme.palette.divider}15 1px, transparent 1px),
         linear-gradient(90deg, ${theme.palette.primary.main}05 1px, transparent 1px)`
      : `radial-gradient(circle, ${theme.palette.divider}20 1px, transparent 1px),
         linear-gradient(90deg, ${theme.palette.primary.main}08 1px, transparent 1px)`,
    backgroundSize: '20px 20px, 100% 100%',
    position: 'relative',
    // 添加装饰性边框
    '&::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      border: `1px solid ${theme.palette.divider}20`,
      borderRadius: 'inherit',
      pointerEvents: 'none',
    }
  },
}));

// 侧边栏移动版本样式
const MobileDrawer = styled(Drawer)(({ theme }) => ({
  '& .MuiDrawer-paper': {
    width: drawerWidth,
    boxSizing: 'border-box',
    backgroundColor: theme.palette.background.sidebar,
    // 添加武林外传主题纹理背景
    backgroundImage: theme.palette.mode === 'light' 
      ? `radial-gradient(circle, ${theme.palette.divider}15 1px, transparent 1px),
         linear-gradient(90deg, ${theme.palette.primary.main}05 1px, transparent 1px)`
      : `radial-gradient(circle, ${theme.palette.divider}20 1px, transparent 1px),
         linear-gradient(90deg, ${theme.palette.primary.main}08 1px, transparent 1px)`,
    backgroundSize: '20px 20px, 100% 100%',
    position: 'relative',
    // 添加装饰性边框
    '&::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      border: `1px solid ${theme.palette.divider}20`,
      borderRadius: 'inherit',
      pointerEvents: 'none',
    }
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

  const drawerContent = (
    <>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" component="div">
          对话列表
        </Typography>
        {isMobile && (
          <IconButton onClick={() => onSelectConversation(currentConversationId)} size="small" aria-label="关闭侧边栏">
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
                        onClick={(e) => handleDeleteClick(conversation.id, e)}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ) : (
                  <Box>
                    <Tooltip title="保存">
                      <IconButton edge="end" size="small" onClick={handleEditSave} aria-label="保存对话标题">
                        <CheckIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="取消">
                      <IconButton edge="end" size="small" onClick={handleEditCancel} aria-label="取消编辑对话标题">
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
                  borderRadius: '8px',
                  m: 0.5,
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
                  <ChatIcon />
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
