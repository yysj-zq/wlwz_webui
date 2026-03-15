import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  TextField,
  Tooltip,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import { createRole, updateRole, deleteRole, uploadRoleAvatar } from '../services/api';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8081';

const RolesConfig = ({ open, onClose, rolesConfig, currentUser, onSaved }) => {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [editSpeakerId, setEditSpeakerId] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [newSpeakerId, setNewSpeakerId] = useState('');

  const roles = rolesConfig?.roles || [];
  const builtin = roles.filter((r) => r.is_builtin);
  const custom = roles.filter((r) => r.is_mine);

  const handleStartEdit = (r) => {
    if (!r.is_mine) return;
    setEditingId(r.id);
    setEditName(r.name);
    setEditPrompt(r.system_prompt || '');
    setEditSpeakerId(r.default_speaker_id || '');
  };

  const handleSaveEdit = async () => {
    if (editingId == null) return;
    try {
      await updateRole(editingId, {
        name: editName,
        system_prompt: editPrompt || null,
        default_speaker_id: editSpeakerId || null,
      });
      onSaved();
      setEditingId(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await createRole({
        name: newName.trim(),
        system_prompt: newPrompt.trim() || null,
        default_speaker_id: newSpeakerId.trim() || null,
      });
      onSaved();
      setAdding(false);
      setNewName('');
      setNewPrompt('');
      setNewSpeakerId('');
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteRole(id);
      onSaved();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAvatarUpload = async (roleId, file) => {
    if (!file) return;
    try {
      await uploadRoleAvatar(roleId, file);
      onSaved();
    } catch (e) {
      console.error(e);
    }
  };

  const avatarUrl = (url) => {
    if (!url) return null;
    return url.startsWith('http') ? url : `${API_BASE}${url}`;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>角色配置</DialogTitle>
      <DialogContent>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          默认角色（全部可见，仅读）
        </Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>头像</TableCell>
                <TableCell>名称</TableCell>
                <TableCell>系统提示</TableCell>
                <TableCell>语音 ID</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {builtin.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Box
                      component="img"
                      src={avatarUrl(r.avatar_url) || ''}
                      alt=""
                      sx={{ width: 40, height: 40, borderRadius: 1, objectFit: 'cover' }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  </TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {(r.system_prompt || '').slice(0, 60)}
                    {(r.system_prompt || '').length > 60 ? '...' : ''}
                  </TableCell>
                  <TableCell>{r.default_speaker_id || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          自定义角色 {!currentUser && '(登录后可添加与编辑)'}
        </Typography>
        {!currentUser ? (
          <Typography variant="body2" color="text.secondary">
            请先登录以管理自定义角色。
          </Typography>
        ) : (
          <>
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>头像</TableCell>
                    <TableCell>名称</TableCell>
                    <TableCell>系统提示</TableCell>
                    <TableCell>语音 ID</TableCell>
                    <TableCell align="right">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {custom.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Box
                            component="img"
                            src={avatarUrl(r.avatar_url) || ''}
                            alt=""
                            sx={{ width: 40, height: 40, borderRadius: 1, objectFit: 'cover' }}
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                          <label>
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={(ev) => {
                                const f = ev.target.files?.[0];
                                if (f) handleAvatarUpload(r.id, f);
                              }}
                            />
                            <Tooltip title="上传头像">
                              <IconButton size="small" component="span">
                                <PhotoCameraIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </label>
                        </Box>
                      </TableCell>
                      {editingId === r.id ? (
                        <>
                          <TableCell>
                            <TextField
                              size="small"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="名称"
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              size="small"
                              multiline
                              value={editPrompt}
                              onChange={(e) => setEditPrompt(e.target.value)}
                              placeholder="系统提示"
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              size="small"
                              value={editSpeakerId}
                              onChange={(e) => setEditSpeakerId(e.target.value)}
                              placeholder="语音 ID"
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Button size="small" onClick={handleSaveEdit}>
                              保存
                            </Button>
                            <Button size="small" onClick={handleCancelEdit}>
                              取消
                            </Button>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell>{r.name}</TableCell>
                          <TableCell sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {(r.system_prompt || '').slice(0, 40)}...
                          </TableCell>
                          <TableCell>{r.default_speaker_id || '-'}</TableCell>
                          <TableCell align="right">
                            <IconButton size="small" onClick={() => handleStartEdit(r)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={() => handleDelete(r.id)} color="error">
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {adding ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mt: 1 }}>
                <TextField
                  size="small"
                  placeholder="角色名"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <TextField
                  size="small"
                  placeholder="系统提示"
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  sx={{ minWidth: 180 }}
                />
                <TextField
                  size="small"
                  placeholder="语音 ID"
                  value={newSpeakerId}
                  onChange={(e) => setNewSpeakerId(e.target.value)}
                />
                <Button size="small" variant="contained" onClick={handleAdd}>
                  添加
                </Button>
                <Button size="small" onClick={() => setAdding(false)}>
                  取消
                </Button>
              </Box>
            ) : (
              <Button startIcon={<AddIcon />} size="small" onClick={() => setAdding(true)}>
                添加自定义角色
              </Button>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
};

export default RolesConfig;
