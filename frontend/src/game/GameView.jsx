// 游戏视图：负责挂载 Phaser 场景容器，维护交互弹窗。
// 世界状态由上层 App.js 单源持有，这里只读 + 触发 onGameAction 回写。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Phaser from 'phaser';
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import TongfuInnScene from './scenes/TongfuInnScene';
import { useLatestRef } from './hooks';

const GameView = ({
  worldState,
  loading = false,
  dialogueLines = [],
  onGameAction,
}) => {
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const sceneRef = useRef(null);
  const worldStateRef = useLatestRef(worldState);
  const onGameActionRef = useLatestRef(onGameAction);
  const [targetEntity, setTargetEntity] = useState(null);
  const [interactionText, setInteractionText] = useState('');

  useEffect(() => {
    sceneRef.current?.applyWorldState(worldState);
  }, [worldState]);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return undefined;

    const scene = new TongfuInnScene({
      getWorldState: () => worldStateRef.current,
      onInteract: (entity) => setTargetEntity(entity),
      onMove: ({ position, direction }) => {
        return Promise.resolve(onGameActionRef.current?.({
          actorId: 'player',
          act_patch: [{ entity_id: 'player', position, direction }],
        })).then((response) => {
          if (response?.world_state) {
            worldStateRef.current = response.world_state;
            sceneRef.current?.applyWorldState(response.world_state);
          }
          return response;
        });
      },
    });
    sceneRef.current = scene;
    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: 18 * 32,
      height: 12 * 32,
      backgroundColor: '#201813',
      pixelArt: true,
      scene,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
    // useLatestRef 返回的 ref 本身稳定，依赖列表保持空数组让 Phaser 只挂载一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latestLine = useMemo(() => {
    if (!dialogueLines.length) return null;
    return dialogueLines[dialogueLines.length - 1];
  }, [dialogueLines]);

  const submitInteraction = () => {
    if (!targetEntity) return;
    const text = interactionText.trim();
    onGameActionRef.current?.({
      actorId: 'player',
      targetId: targetEntity.id,
      speak: text || null,
      act_patch: text ? [] : [{ entity_id: targetEntity.id, public_state: { last_interactor: 'player' } }],
    });
    setInteractionText('');
    setTargetEntity(null);
  };

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 360px' },
        gap: 2,
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        p: { xs: 1, md: 2 },
        pt: { xs: 7, md: 9 },
      }}
    >
      <Box
        sx={{
          position: 'relative',
          minHeight: 420,
          borderRadius: 4,
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #211813, #3d2b1f)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 18px 60px rgba(0,0,0,0.32)',
        }}
      >
        <Box ref={containerRef} sx={{ width: '100%', height: '100%' }} />
        {loading ? (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.28)' }}>
            <CircularProgress />
          </Box>
        ) : null}
      </Box>

      <Box
        sx={{
          borderRadius: 4,
          p: 2,
          background: 'rgba(22, 19, 16, 0.72)',
          color: '#f8ead0',
          border: '1px solid rgba(255,255,255,0.12)',
          overflow: 'auto',
        }}
      >
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="overline" sx={{ color: 'rgba(248,234,208,0.7)' }}>
              Game Session
            </Typography>
            <Typography variant="h6">同福客栈</Typography>
            <Typography variant="caption" sx={{ color: 'rgba(248,234,208,0.62)' }}>
              方向键移动，点击 NPC 或物件交互。
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip size="small" label={`版本 ${worldState?.state_version || 0}`} />
            <Chip size="small" label={`${Object.keys(worldState?.entities || {}).length} 个实体`} />
          </Stack>
          {latestLine ? (
            <Box sx={{ p: 1.5, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
              <Typography variant="caption" sx={{ opacity: 0.72 }}>
                {latestLine.actor_id || 'scene'}
              </Typography>
              <Typography variant="body2">{latestLine.text || latestLine.content}</Typography>
            </Box>
          ) : null}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              最近时间线
            </Typography>
            {dialogueLines.slice(-6).map((line, index) => (
              <Typography
                key={`${line.actor_id || 'scene'}-${index}`}
                variant="caption"
                sx={{ display: 'block', opacity: 0.72 }}
              >
                {line.actor_id || 'scene'}：{line.text || line.content || ''}
              </Typography>
            ))}
          </Box>
        </Stack>
      </Box>

      <Dialog open={Boolean(targetEntity)} onClose={() => setTargetEntity(null)} fullWidth maxWidth="sm">
        <DialogTitle>与 {targetEntity?.name} 交互</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="你想说什么或做什么？"
            fullWidth
            multiline
            minRows={3}
            value={interactionText}
            onChange={(event) => setInteractionText(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTargetEntity(null)}>取消</Button>
          <Button variant="contained" onClick={submitInteraction} disabled={loading}>
            发送
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default GameView;
