/**
 * GameShell widget（Phase 2 VS8 + AF2/AF3/AF6）。
 *
 * 布局：左侧全幅游戏场景；右侧可滑出/隐藏面板（扮演角色 + 最近时间线）。
 * 交互在场景内完成（点 NPC/物件 → 对话框；方向键移动），无 InteractionDock。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  WorldEntity,
  WorldState,
  WorldEntityPatch,
  TimelineEntry,
  RoleOut,
  Direction,
  ConversationWorldRead,
} from '@shared/api';
import { useGameActionEndpointApiConversationsConversationIdActionsPost } from '@shared/api';
import { useWorld, useTimeline, useRoles } from '@shared/api/hooks';
import { queryKeys } from '@shared/api/queryClient';
import {
  createStageCue,
  defaultMapCatalog,
  loadCollisionTiles,
  stepInDirection,
  withCollisionTiles,
  type MapSpec,
} from '@shared/stage';

import { CinematicLayout } from '@ds/patterns';
import type { NarrativeBeat } from '@entities/timeline/model';
import { useTurnQueue } from '@features/turn-queue/useTurnQueue';
import { useSetPlayedRole } from '@features/played-role';
import { TurnHUD } from '@widgets/turn-hud/TurnHUD';
import { CircleRoleSelector, type RolePillOption } from '@widgets/chat-shell/CircleRoleSelector';
import { roleOutToPill } from '@widgets/chat-shell/roleOutToPill';
import { StageViewport, type StageViewportHandle } from './StageViewport';
import { NarrativeRail } from './NarrativeRail';
import { SceneInteractDialog } from './SceneInteractDialog';

export interface GameShellProps {
  readonly conversationId: number | null;
  readonly initialWorld?: WorldState | null;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly ariaLabel?: string;
  readonly __testHooks?: {
    useWorld?: typeof useWorld;
    useTimeline?: typeof useTimeline;
    useRoles?: typeof useRoles;
  };
}

const MANIFEST_URL = '/assets/manifest.json';
const MOVE_DEBOUNCE_MS = 250;
const PANEL_WIDTH_PX = 360;

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'north',
  w: 'north',
  W: 'north',
  ArrowRight: 'east',
  d: 'east',
  D: 'east',
  ArrowDown: 'south',
  s: 'south',
  S: 'south',
  ArrowLeft: 'west',
  a: 'west',
  A: 'west',
};

const containerBaseStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  minHeight: 0,
  overflow: 'hidden',
  fontFamily: 'var(--font-ui)',
};

const stageAreaStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  minHeight: 0,
  minWidth: 0,
};

const hudOverlayStyle: CSSProperties = {
  position: 'absolute',
  top: 'var(--size-spacing-4)',
  left: 'var(--size-spacing-4)',
  zIndex: 50,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--size-spacing-2)',
  pointerEvents: 'auto',
};

const hintStyle: CSSProperties = {
  position: 'absolute',
  bottom: 'var(--size-spacing-4)',
  left: 'var(--size-spacing-4)',
  zIndex: 40,
  padding: 'var(--size-spacing-1) var(--size-spacing-2)',
  fontSize: 'var(--text-size-xs)',
  color: 'var(--color-text-inverse)',
  background: 'rgba(33, 24, 19, 0.55)',
  borderRadius: 'var(--radius-sm)',
  pointerEvents: 'none',
};

function panelShellStyle(open: boolean): CSSProperties {
  return {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: PANEL_WIDTH_PX,
    zIndex: 60,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--size-spacing-3)',
    padding: 'var(--size-spacing-4)',
    boxSizing: 'border-box',
    background: 'linear-gradient(180deg, rgba(45, 32, 24, 0.96) 0%, rgba(28, 20, 16, 0.98) 100%)',
    borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
    boxShadow: open ? '-12px 0 40px rgba(0, 0, 0, 0.35)' : 'none',
    transform: open ? 'translateX(0)' : `translateX(${PANEL_WIDTH_PX}px)`,
    transition: 'transform 220ms ease',
    pointerEvents: open ? 'auto' : 'none',
  };
}

const panelToggleStyle = (open: boolean): CSSProperties => ({
  position: 'absolute',
  top: '50%',
  right: open ? PANEL_WIDTH_PX : 0,
  zIndex: 70,
  transform: 'translateY(-50%)',
  transition: 'right 220ms ease',
  width: 28,
  height: 64,
  padding: 0,
  border: '1px solid rgba(255, 255, 255, 0.14)',
  borderRight: open ? 'none' : '1px solid rgba(255, 255, 255, 0.14)',
  borderRadius: open
    ? 'var(--radius-sm) 0 0 var(--radius-sm)'
    : 'var(--radius-sm) 0 0 var(--radius-sm)',
  background: 'rgba(45, 32, 24, 0.92)',
  color: 'var(--color-text-inverse)',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
});

const panelSectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-size-xs)',
  fontWeight: 600,
  letterSpacing: '0.04em',
  color: 'rgba(255, 255, 255, 0.72)',
};

const panelBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--size-spacing-2)',
  minHeight: 0,
};

type PendingMove = {
  readonly position: { readonly x: number; readonly y: number };
  readonly direction: Direction;
};

export function GameShell({
  conversationId,
  initialWorld,
  className,
  style,
  ariaLabel = '戏台',
  __testHooks,
}: GameShellProps) {
  const useWorldHook = __testHooks?.useWorld ?? useWorld;
  const useTimelineHook = __testHooks?.useTimeline ?? useTimeline;
  const useRolesHook = __testHooks?.useRoles ?? useRoles;

  const worldQuery = useWorldHook(conversationId);
  const timelineQuery = useTimelineHook(conversationId);
  const rolesQuery = useRolesHook();

  const stageRef = useRef<StageViewportHandle>(null);
  const lastCueKeyRef = useRef<string | null>(null);
  const [stageReady, setStageReady] = useState(false);
  const pendingMoveRef = useRef<PendingMove | null>(null);
  const moveTimerRef = useRef<number | null>(null);
  const targetEntityRef = useRef<WorldEntity | null>(null);

  const [panelOpen, setPanelOpen] = useState(true);
  const [targetEntity, setTargetEntity] = useState<WorldEntity | null>(null);
  const [optimisticPose, setOptimisticPose] = useState<PendingMove | null>(null);
  const [mapSpec, setMapSpec] = useState<MapSpec | null>(null);

  targetEntityRef.current = targetEntity;

  const baseWorld: WorldState | null = useMemo(
    () => worldQuery.data?.worldState ?? initialWorld ?? null,
    [worldQuery.data, initialWorld],
  );

  const playerEntity: WorldEntity | null = useMemo(() => {
    if (!baseWorld) return null;
    const playerId = baseWorld.playerActorId ?? 'player';
    return (
      baseWorld.entities[playerId] ??
      Object.values(baseWorld.entities).find((e) => e.kind === 'player') ??
      null
    );
  }, [baseWorld]);

  useEffect(() => {
    const mapId = baseWorld?.mapId;
    if (!mapId) {
      setMapSpec(null);
      return;
    }
    const base = defaultMapCatalog().find((m) => m.mapId === mapId) ?? null;
    if (!base) {
      setMapSpec(null);
      return;
    }
    setMapSpec(base);
    const collisionUrl = base.urls.collision;
    if (!collisionUrl) return;

    let cancelled = false;
    void loadCollisionTiles(collisionUrl, base.size.cols, base.size.rows)
      .then((tiles) => {
        if (cancelled) return;
        setMapSpec(withCollisionTiles(base, tiles));
      })
      .catch(() => {
        // 碰撞加载失败时保留仅出界检查，不阻断移动
        if (!cancelled) setMapSpec(base);
      });
    return () => {
      cancelled = true;
    };
  }, [baseWorld?.mapId]);

  const world: WorldState | null = useMemo(() => {
    if (!baseWorld || !optimisticPose || !playerEntity) return baseWorld;
    return {
      ...baseWorld,
      entities: {
        ...baseWorld.entities,
        [playerEntity.id]: {
          ...playerEntity,
          position: optimisticPose.position,
          direction: optimisticPose.direction,
        },
      },
    };
  }, [baseWorld, optimisticPose, playerEntity]);

  const worldStateVersion = world?.stateVersion ?? 0;
  const timelineEntries = useMemo<readonly TimelineEntry[]>(
    () => timelineQuery.data ?? [],
    [timelineQuery.data],
  );

  const roles = useMemo<readonly RoleOut[]>(() => rolesQuery.data ?? [], [rolesQuery.data]);

  const playablePills = useMemo<readonly RolePillOption[]>(
    () => roles.filter((r) => r.inGame && r.slug).map(roleOutToPill),
    [roles],
  );

  const playedActorId = world?.playerActorId ?? playablePills[0]?.slug ?? 'player';

  const {
    phase: turnPhase,
    submit: submitTurn,
    lastError,
    lastResult,
  } = useTurnQueue(conversationId);
  const gameAction = useGameActionEndpointApiConversationsConversationIdActionsPost();
  const queryClient = useQueryClient();
  const { setPlayedRole, isPending: playedPending } = useSetPlayedRole();

  const turnBusy =
    turnPhase === 'optimistic' || turnPhase === 'in_flight' || turnPhase === 'applying';

  const turnBusyRef = useRef(turnBusy);
  turnBusyRef.current = turnBusy;
  const playerEntityRef = useRef(playerEntity);
  playerEntityRef.current = playerEntity;
  const optimisticPoseRef = useRef(optimisticPose);
  optimisticPoseRef.current = optimisticPose;
  const mapSpecRef = useRef(mapSpec);
  mapSpecRef.current = mapSpec;
  const worldRef = useRef(world);
  worldRef.current = world;

  const runTurn = useCallback(
    (args: {
      readonly actPatch: readonly WorldEntityPatch[];
      readonly speak?: string;
      readonly targetId?: string | null;
    }) => {
      if (!conversationId) return;
      submitTurn(
        {
          actPatch: [...args.actPatch],
          actorId: playerEntityRef.current?.id ?? playedActorId,
          expectedStateVersion: worldStateVersion,
          ...(args.speak ? { speak: args.speak } : {}),
          ...(args.targetId ? { targetId: args.targetId } : {}),
        },
        async (action) => {
          if (!conversationId) throw new Error('conversationId not ready');
          if (action.expectedStateVersion === undefined) {
            throw new Error('state_version_required');
          }
          const actPatch = action.actPatch ?? [];
          const turn = await gameAction.mutateAsync({
            conversationId,
            data: {
              stateVersion: action.expectedStateVersion,
              actorId: action.actorId ?? 'player',
              speak: action.speak ?? null,
              targetId: action.targetId ?? null,
              actPatch,
            },
          });
          return {
            kind: 'ok' as const,
            worldState: turn.worldState,
            timelineDelta: turn.timelineDelta ?? [],
            stateVersion: turn.stateVersion,
          };
        },
      );
    },
    [conversationId, gameAction, playedActorId, submitTurn, worldStateVersion],
  );

  const runTurnRef = useRef(runTurn);
  runTurnRef.current = runTurn;

  /**
   * 防抖落地移动：
   * - 连按只保留最新 pose，250ms 静默后提交
   * - 交互框打开时不发
   * - 回合在途时禁止新动作（不排队、不补发）
   */
  const flushMove = useCallback(() => {
    if (moveTimerRef.current !== null) {
      window.clearTimeout(moveTimerRef.current);
      moveTimerRef.current = null;
    }
    const pending = pendingMoveRef.current;
    const player = playerEntityRef.current;
    if (!pending || !player) return;
    if (targetEntityRef.current) return;
    if (turnBusyRef.current) {
      pendingMoveRef.current = null;
      return;
    }
    pendingMoveRef.current = null;
    runTurnRef.current({
      actPatch: [
        {
          entityId: player.id,
          position: pending.position,
          direction: pending.direction,
        },
      ],
    });
  }, []);

  const scheduleMoveFlush = useCallback(() => {
    if (moveTimerRef.current !== null) window.clearTimeout(moveTimerRef.current);
    moveTimerRef.current = window.setTimeout(flushMove, MOVE_DEBOUNCE_MS);
  }, [flushMove]);

  const closeInteraction = useCallback(() => {
    setTargetEntity(null);
    if (!turnBusyRef.current && pendingMoveRef.current) scheduleMoveFlush();
  }, [scheduleMoveFlush]);

  const handleEntityInteract = useCallback((entityId: string) => {
    if (turnBusyRef.current) return;
    const currentWorld = worldRef.current;
    const player = playerEntityRef.current;
    const entity = currentWorld?.entities[entityId];
    if (!entity) return;
    if (!(entity.interactable || entity.kind === 'npc')) return;
    if (player && entity.id === player.id) return;
    // 打开交互框：暂停待发移动防抖，发送时与台词合并，取消时重启
    if (moveTimerRef.current !== null) {
      window.clearTimeout(moveTimerRef.current);
      moveTimerRef.current = null;
    }
    setTargetEntity(entity);
  }, []);

  const handleInteractSubmit = useCallback(
    (text: string) => {
      if (turnBusyRef.current) return;
      const player = playerEntityRef.current;
      if (!targetEntity || !player) return;
      if (moveTimerRef.current !== null) {
        window.clearTimeout(moveTimerRef.current);
        moveTimerRef.current = null;
      }
      const pending = pendingMoveRef.current;
      pendingMoveRef.current = null;
      const actPatch: WorldEntityPatch[] = pending
        ? [
            {
              entityId: player.id,
              position: pending.position,
              direction: pending.direction,
            },
          ]
        : [];
      runTurnRef.current({
        actPatch,
        speak: text,
        targetId: targetEntity.id,
      });
      setTargetEntity(null);
      setOptimisticPose(null);
    },
    [targetEntity],
  );

  // 方向键：本地乐观累积；回合在途时禁止移动
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (turnBusyRef.current) return;
      if (targetEntityRef.current) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }
      const direction = KEY_TO_DIRECTION[event.key];
      const currentWorld = worldRef.current;
      const player = playerEntityRef.current;
      if (!direction || !currentWorld || !player) return;
      event.preventDefault();

      const from = optimisticPoseRef.current?.position ?? player.position;
      const spec = mapSpecRef.current;
      let next = { x: from.x, y: from.y };
      if (spec) {
        const stepped = stepInDirection(spec, from, direction, true);
        if (stepped.hit) return;
        next = { x: stepped.x, y: stepped.y };
      } else {
        const delta =
          direction === 'north'
            ? { x: 0, y: -1 }
            : direction === 'south'
              ? { x: 0, y: 1 }
              : direction === 'east'
                ? { x: 1, y: 0 }
                : { x: -1, y: 0 };
        next = { x: from.x + delta.x, y: from.y + delta.y };
      }

      const pose: PendingMove = { position: next, direction };
      optimisticPoseRef.current = pose;
      setOptimisticPose(pose);
      pendingMoveRef.current = pose;
      scheduleMoveFlush();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [scheduleMoveFlush]);

  useEffect(() => {
    return () => {
      if (moveTimerRef.current !== null) window.clearTimeout(moveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!optimisticPose || !playerEntity) return;
    const server = baseWorld?.entities[playerEntity.id];
    if (
      server &&
      server.position.x === optimisticPose.position.x &&
      server.position.y === optimisticPose.position.y
    ) {
      setOptimisticPose(null);
    }
  }, [baseWorld, optimisticPose, playerEntity]);

  useEffect(() => {
    if (!lastResult || !conversationId) return;

    if (lastResult.kind === 'ok') {
      const cid = conversationId;
      queryClient.setQueryData(
        queryKeys.conversation.world(cid),
        (prev: ConversationWorldRead | undefined) => {
          const world = lastResult.worldState;
          return {
            ...(prev ?? {
              mapId: world.mapId,
              stateVersion: world.stateVersion,
              worldState: world,
            }),
            mapId: world.mapId,
            stateVersion: lastResult.stateVersion,
            worldState: world,
          };
        },
      );
      queryClient.setQueryData(
        queryKeys.conversation.timeline(cid),
        (prev: TimelineEntry[] | undefined) => {
          const prevList = prev ?? [];
          const delta = lastResult.timelineDelta ?? [];
          if (delta.length === 0) return prevList;
          const seen = new Set(
            prevList.map((e) => `${String(e.id ?? '')}:${e.turnId ?? ''}:${e.intraTurnSeq ?? 0}`),
          );
          const merged = [...prevList];
          for (const entry of delta) {
            const key = `${String(entry.id ?? '')}:${entry.turnId ?? ''}:${entry.intraTurnSeq ?? 0}`;
            if (!seen.has(key)) {
              seen.add(key);
              merged.push(entry);
            }
          }
          return merged;
        },
      );
      return;
    }

    if (lastResult.kind === 'conflict') {
      const world = lastResult.worldState;
      queryClient.setQueryData(
        queryKeys.conversation.world(conversationId),
        (prev: ConversationWorldRead | undefined) => ({
          ...(prev ?? {
            mapId: world.mapId,
            stateVersion: world.stateVersion,
            worldState: world,
          }),
          mapId: world.mapId,
          stateVersion: lastResult.currentStateVersion,
          worldState: world,
        }),
      );
      setOptimisticPose(null);
    }
  }, [lastResult, queryClient, conversationId]);

  const handleNarrativeSelect = useCallback((_entryId: string | number, beat: NarrativeBeat) => {
    if (!beat.actorId) return;
    stageRef.current?.focusActor(beat.actorId);
  }, []);

  useEffect(() => {
    if (!stageReady) return;
    const w = worldRef.current;
    if (!w) return;

    // 每角色投影 timeline 中最新一句（speak ?? narration），常驻头顶
    const latestByActor = new Map<
      string,
      { readonly actor: WorldEntity; readonly text: string; readonly seq: number }
    >();
    let newestActorId: string | null = null;
    let newestSeq = -Infinity;

    for (let i = 0; i < timelineEntries.length; i++) {
      const e = timelineEntries[i];
      if (!e?.actorId) continue;
      const text = e.speak ?? e.narration;
      if (typeof text !== 'string' || text.length === 0) continue;
      const actor = w.entities[e.actorId];
      if (!actor) continue;
      const seq = i;
      latestByActor.set(e.actorId, { actor, text, seq });
      if (seq >= newestSeq) {
        newestSeq = seq;
        newestActorId = e.actorId;
      }
    }

    const signature = [...latestByActor.entries()]
      .map(([id, v]) => `${id}:${v.text}`)
      .sort()
      .join('|');
    if (lastCueKeyRef.current === signature) return;

    const stage = stageRef.current;
    if (!stage) return;

    const now = performance.now();
    const cues = [...latestByActor.values()].map(({ actor, text }) =>
      createStageCue({
        actor,
        actorName: actor.name,
        text,
        now,
      }),
    );
    stage.setSpeechCues(cues);
    lastCueKeyRef.current = signature;
    if (newestActorId) {
      stage.focusActor(newestActorId);
    }
  }, [timelineEntries, stageReady]);

  async function handlePlayedChange(slug: string) {
    if (!conversationId || slug === playedActorId) return;
    await setPlayedRole({ conversationId, actorId: slug });
  }

  return (
    <section
      role="application"
      aria-label={ariaLabel}
      aria-busy={turnBusy}
      data-testid="game-shell"
      data-conversation-id={conversationId ?? 'none'}
      data-turn-phase={turnPhase}
      data-map-id={world?.mapId ?? 'none'}
      data-side-panel={panelOpen ? 'open' : 'closed'}
      className={className}
      style={{ ...containerBaseStyle, ...style }}
    >
      <div style={stageAreaStyle}>
        <CinematicLayout tone="warm" style={{ width: '100%', height: '100%' }}>
          <StageViewport
            ref={stageRef}
            mapId={world?.mapId ?? null}
            world={world}
            manifestUrl={MANIFEST_URL}
            contentInset={panelOpen ? { right: PANEL_WIDTH_PX } : null}
            onEntityInteract={handleEntityInteract}
            onStatusChange={(status) => {
              setStageReady(status === 'ready');
              if (status !== 'ready') {
                lastCueKeyRef.current = null;
              }
            }}
          />
        </CinematicLayout>
        <div style={hudOverlayStyle}>
          <TurnHUD conversationId={conversationId} />
          {lastError ? (
            <span
              role="alert"
              data-testid="game-shell-error"
              style={{
                padding: 'var(--size-spacing-1) var(--size-spacing-2)',
                background: 'var(--color-lacquer)',
                color: 'var(--color-text-inverse)',
                fontSize: 'var(--text-size-xs)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {lastError.message}
            </span>
          ) : null}
        </div>
        <div style={hintStyle}>方向键移动 · 点击 NPC 或物件交互</div>
      </div>

      <button
        type="button"
        aria-expanded={panelOpen}
        aria-controls="game-side-panel"
        data-testid="game-side-panel-toggle"
        title={panelOpen ? '收起侧栏' : '展开侧栏'}
        onClick={() => setPanelOpen((v) => !v)}
        style={panelToggleStyle(panelOpen)}
      >
        {panelOpen ? '›' : '‹'}
      </button>

      <div
        id="game-side-panel"
        data-testid="game-side-panel"
        aria-hidden={!panelOpen}
        style={panelShellStyle(panelOpen)}
      >
        <div style={panelBlockStyle} data-testid="game-played-role-strip">
          <p style={panelSectionTitleStyle}>扮演角色</p>
          <CircleRoleSelector
            label="扮演角色"
            value={playedActorId}
            options={playablePills}
            onChange={(slug) => void handlePlayedChange(slug)}
            disabled={playedPending || !conversationId}
            testId="game-played-role"
            preferredPlacement="below"
          />
        </div>

        <div
          style={{
            ...panelBlockStyle,
            flex: '1 1 0',
            minHeight: 0,
          }}
        >
          <p style={panelSectionTitleStyle}>最近时间线</p>
          <div style={{ flex: 1, minHeight: 0 }}>
            <NarrativeRail
              entries={timelineEntries}
              world={world}
              autoFollow
              onSelect={handleNarrativeSelect}
            />
          </div>
        </div>
      </div>

      <SceneInteractDialog
        open={Boolean(targetEntity)}
        targetName={targetEntity?.name ?? ''}
        disabled={turnBusy}
        onClose={closeInteraction}
        onSubmit={handleInteractSubmit}
      />
    </section>
  );
}

export default GameShell;
