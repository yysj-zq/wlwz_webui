// 游戏视图：负责挂载 Phaser 场景容器，维护交互弹窗。
// 世界状态由上层 App.js 单源持有，这里只读 + 触发 onGameAction 回写。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Phaser from 'phaser';
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import TongfuInnScene from './scenes/TongfuInnScene';
import { RoleSelector } from '../components/RoleSelector';
import { useLatestRef } from './hooks';

const MOVE_DEBOUNCE_MS = 250;
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8081';
// 世界尚未加载时的临时 slug fallback（须由后端 roles 提供同名注册表角色，不是前端合成身份）。
const PLAYER_ACTOR_ID = 'player';

const GameView = ({
  worldState,
  conversationKey = null,
  loading = false,
  dialogueLines = [],
  speechByActor = null,
  speakableActorIds = null,
  rolesConfig = null,
  onGameAction,
  onChangePlayedRole,
  onSpeakTTS,
}) => {
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const sceneRef = useRef(null);
  const worldStateRef = useLatestRef(worldState);
  const onGameActionRef = useLatestRef(onGameAction);
  const onSpeakTTSRef = useLatestRef(onSpeakTTS);
  const speakableActorIdsRef = useLatestRef(speakableActorIds);
  const [targetEntity, setTargetEntity] = useState(null);
  const [interactionText, setInteractionText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const targetEntityRef = useLatestRef(targetEntity);
  const pendingMoveRef = useRef(null);
  const moveTimerRef = useRef(null);
  const requestInFlightRef = useRef(false);
  const pendingInteractionRef = useRef(null);
  // 切会话时递增；在途回合 finally 对照世代，避免把旧会话动作冲到新会话。
  const sessionGenRef = useRef(0);
  const inFlightGenRef = useRef(null);

  const playerActorId = worldState?.player_actor_id || PLAYER_ACTOR_ID;

  useEffect(() => {
    sessionGenRef.current += 1;
    if (moveTimerRef.current) {
      clearTimeout(moveTimerRef.current);
      moveTimerRef.current = null;
    }
    pendingMoveRef.current = null;
    pendingInteractionRef.current = null;
    setTargetEntity(null);
    setInteractionText('');
    // 不强制清 requestInFlight：旧请求仍会结束；世代校验会阻止它补发 pending。
  }, [conversationKey]);

  useEffect(() => {
    sceneRef.current?.applyWorldState(worldState);
  }, [worldState]);

  // 每实体最近一句 → 场景常驻气泡。放在 worldState effect 之后声明，
  // 保证同一次渲染里先重建精灵、再贴气泡（气泡定位依赖精灵/实体位置）。
  useEffect(() => {
    sceneRef.current?.applyDialogueLines(speechByActor || {});
  }, [speechByActor]);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return undefined;

    const scene = new TongfuInnScene({
      getWorldState: () => worldStateRef.current,
      onInteract: (entity) => {
        // 打开交互框：暂停待发移动的防抖，避免移动单独发请求；发送时合并，取消时重启。
        if (moveTimerRef.current) {
          clearTimeout(moveTimerRef.current);
          moveTimerRef.current = null;
        }
        setTargetEntity(entity);
      },
      onLocalMove: handleLocalMove,
      isMoveLocked: () => Boolean(targetEntityRef.current),
      onSpeakTTS: (slug, text) => onSpeakTTSRef.current?.(slug, text),
      // 遵循配置：仅对配了 speaker 的 slug 允许气泡 TTS 图标。
      canSpeak: (slug) => Boolean(speakableActorIdsRef.current?.has(slug)),
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
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
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

  // 与 Chat 共用 RoleSelector：roleList 形状一致，仅保留 in_game 可扮演角色。
  const playedRoleList = useMemo(() => (
    (rolesConfig?.roles || [])
      .filter((r) => r.in_game === true && r.slug)
      .map((r) => ({
        name: r.name,
        slug: r.slug,
        avatar: r.avatar_url
          ? (r.avatar_url.startsWith('http') ? r.avatar_url : `${API_BASE}${r.avatar_url}`)
          : '',
        description: (r.system_prompt || '').slice(0, 40) + ((r.system_prompt || '').length > 40 ? '…' : ''),
      }))
  ), [rolesConfig]);
  const currentPlayedName = playedRoleList.find((o) => o.slug === playerActorId)?.name
    || playedRoleList[0]?.name
    || '';

  // 统一回合派发：保证任一时刻只有一个 /game 请求在途（沿用旧 moveLocked 的串行化，
  // 避免并发回合从同一旧 world_state 快照各自 commit 而丢写）。在途期间的移动仍本地
  // 乐观累积到 pendingMoveRef，回合结束后若有新 pending 再按防抖补发。
  const runTurn = (payload) => {
    const gen = sessionGenRef.current;
    inFlightGenRef.current = gen;
    requestInFlightRef.current = true;
    setSubmitting(true);
    return Promise.resolve(onGameActionRef.current?.(payload))
      .then((response) => {
        if (gen !== sessionGenRef.current) {
          return null;
        }
        if (response?.world_state) {
          worldStateRef.current = response.world_state;
          sceneRef.current?.applyWorldState(response.world_state);
        }
        return response;
      })
      .finally(() => {
        if (inFlightGenRef.current === gen) {
          requestInFlightRef.current = false;
          inFlightGenRef.current = null;
          setSubmitting(false);
        }
        if (gen !== sessionGenRef.current) {
          return;
        }
        // 优先补发在途期间点了发送、被推迟的交互；否则若有累积移动按防抖补发。
        if (pendingInteractionRef.current) {
          const next = pendingInteractionRef.current;
          pendingInteractionRef.current = null;
          runTurn(next);
        } else if (pendingMoveRef.current && !targetEntityRef.current) {
          if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
          moveTimerRef.current = setTimeout(flushMove, MOVE_DEBOUNCE_MS);
        }
      });
  };

  const flushMove = () => {
    if (moveTimerRef.current) {
      clearTimeout(moveTimerRef.current);
      moveTimerRef.current = null;
    }
    const pending = pendingMoveRef.current;
    if (!pending) return;
    // 有请求在途：不发新提交，保留 pending，待在途回合 finally 里补发。
    if (requestInFlightRef.current) return;
    pendingMoveRef.current = null;
    const pid = worldStateRef.current?.player_actor_id || PLAYER_ACTOR_ID;
    runTurn({
      actorId: pid,
      act_patch: [{ entity_id: pid, position: pending.position, direction: pending.direction }],
    });
  };

  const handleLocalMove = ({ position, direction }) => {
    // 本地乐观：即时更新前端 world_state 并重绘，不等后端。
    // 移动的实体 = 会话级 player_actor_id（embody 后为对应角色 slug）。
    const current = worldStateRef.current;
    const pid = current?.player_actor_id || PLAYER_ACTOR_ID;
    if (current?.entities?.[pid]) {
      const nextState = {
        ...current,
        entities: {
          ...current.entities,
          [pid]: { ...current.entities[pid], position, direction },
        },
      };
      worldStateRef.current = nextState;
      sceneRef.current?.applyWorldState(nextState);
    }
    pendingMoveRef.current = { position, direction };
    if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
    moveTimerRef.current = setTimeout(flushMove, MOVE_DEBOUNCE_MS);
  };

  const submitInteraction = () => {
    if (!targetEntity) return;
    const text = interactionText.trim();
    // 无言交互暂不做：不打字直接提交时仅关闭弹窗；有待发移动则经 closeInteraction 重启防抖。
    if (!text) {
      closeInteraction();
      return;
    }
    // 合并待发移动：pendingMove 与台词进同一请求。
    if (moveTimerRef.current) {
      clearTimeout(moveTimerRef.current);
      moveTimerRef.current = null;
    }
    const pending = pendingMoveRef.current;
    pendingMoveRef.current = null;
    const pid = worldStateRef.current?.player_actor_id || PLAYER_ACTOR_ID;
    const act_patch = pending
      ? [{ entity_id: pid, position: pending.position, direction: pending.direction }]
      : [];
    const payload = {
      actorId: pid,
      targetId: targetEntity.id,
      speak: text,
      act_patch,
    };
    // 有请求在途：推迟到当前回合结束后再发，避免并发回合丢写。
    if (requestInFlightRef.current) {
      pendingInteractionRef.current = payload;
    } else {
      runTurn(payload);
    }
    setInteractionText('');
    setTargetEntity(null);
  };

  const closeInteraction = () => {
    setTargetEntity(null);
    setInteractionText('');
    // 交互框打开期间移动被锁；关闭后若有未发的移动，重启防抖到点发送。
    if (pendingMoveRef.current) {
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
      moveTimerRef.current = setTimeout(flushMove, MOVE_DEBOUNCE_MS);
    }
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

          <Box>
            <Typography variant="caption" sx={{ color: 'rgba(248,234,208,0.7)', display: 'block', mb: 0.75 }}>
              扮演角色
            </Typography>
            <RoleSelector
              assistantRole={currentPlayedName}
              setAssistantRole={onChangePlayedRole}
              roleList={playedRoleList}
            />
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip size="small" label={`版本 ${worldState?.state_version || 0}`} />
            <Chip size="small" label={`${Object.keys(worldState?.entities || {}).length} 个实体`} />
          </Stack>
          {latestLine ? (
            <Box sx={{ p: 1.5, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
              <Typography variant="caption" sx={{ opacity: 0.72 }}>
                {latestLine.name || latestLine.actor_id || 'scene'}
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
                {line.name || line.actor_id || 'scene'}：{line.text || line.content || ''}
              </Typography>
            ))}
          </Box>
        </Stack>
      </Box>

      <Dialog open={Boolean(targetEntity)} onClose={closeInteraction} fullWidth maxWidth="sm">
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
          <Button onClick={closeInteraction}>取消</Button>
          <Button variant="contained" onClick={submitInteraction} disabled={loading || submitting}>
            发送
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default GameView;
