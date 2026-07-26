/**
 * ChatShell —— 聊天主壳（产品视觉 ≈ `_legacy` Chat + image.png 底栏）。
 *
 * 布局：全高 flex 列 → 消息区（legacy 气泡）+ 底栏 Composer
 * （扮演 / 对话角色药丸 + 输入 +「发送台词」）。
 * TTS 挂在 NPC 对白气泡上；空态文案：「舞台已就绪」。
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useChatEndpointApiConversationsConversationIdChatPost,
  type ConversationWorldRead,
  type RoleOut,
  type TimelineEntry,
  type WorldState,
} from '@shared/api';
import { useRoles, useTimeline, useWorld } from '@shared/api/hooks';
import { queryKeys } from '@shared/api/queryClient';
import { projectTimeline, type NarrativeBeat } from '@entities/timeline/model';
import { useSetPlayedRole } from '@features/played-role';
import { useTurnQueue } from '@features/turn-queue/useTurnQueue';
import { TtsButton } from '@features/tts';
import { Button } from '@ds/primitives/Button';
import { IconButton } from '@ds/primitives/IconButton';
import { CircleRoleSelector, type RolePillOption } from './CircleRoleSelector';
import { roleOutToPill } from './roleOutToPill';
import { resolveMediaUrl } from './resolveMediaUrl';

const PLACEHOLDER_AVATAR =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="#9e9e9e"><circle cx="24" cy="24" r="24"/><text x="24" y="30" text-anchor="middle" fill="#fff" font-size="20" font-family="sans-serif">?</text></svg>',
  );

const shellStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  minHeight: 0,
  maxWidth: 1260,
  margin: '0 auto',
  padding: 'var(--size-spacing-2) var(--size-spacing-5) var(--size-spacing-3)',
  fontFamily: 'var(--font-ui)',
};

const messagesStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--size-spacing-2)',
  padding: 'var(--size-spacing-2) 0',
};

const emptyStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  gap: 'var(--size-spacing-2)',
  color: 'var(--color-text-secondary)',
  padding: 'var(--size-spacing-8)',
};

const composerStyle: CSSProperties = {
  marginTop: 'var(--size-spacing-2)',
  borderRadius: 'var(--radius-2xl)',
  padding: 'var(--size-spacing-3)',
  border: '1px solid var(--color-border-subtle)',
  background: 'var(--color-surface-1)',
  boxShadow: 'var(--shadow-lg), var(--shadow-inset-paper)',
  position: 'sticky',
  bottom: 0,
  zIndex: 5,
};

const directorStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 'var(--size-spacing-2)',
  marginBottom: 'var(--size-spacing-3)',
  padding: 'var(--size-spacing-3)',
  borderRadius: 'var(--radius-xl)',
  background: 'var(--color-overlay-paper-soft)',
};

const roleBioStyle: CSSProperties = {
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--size-spacing-2) var(--size-spacing-3)',
  background: 'var(--color-surface-0)',
  minWidth: 0,
};

const inputRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 'var(--size-spacing-2)',
};

const textareaStyle: CSSProperties = {
  flex: 1,
  minHeight: 40,
  maxHeight: 140,
  resize: 'vertical',
  padding: 'var(--size-spacing-2) var(--size-spacing-3)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border-default)',
  background: 'var(--color-surface-0)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-size-base)',
  lineHeight: 1.45,
};

function avatarFor(
  actorId: string | null,
  rolesBySlug: Map<string, RolePillOption>,
  world: WorldState | null,
): string {
  if (!actorId) return PLACEHOLDER_AVATAR;
  const fromRole = rolesBySlug.get(actorId);
  if (fromRole?.avatarUrl) {
    return resolveMediaUrl(fromRole.avatarUrl) ?? PLACEHOLDER_AVATAR;
  }
  const entity = world?.entities[actorId];
  if (entity?.assetKey) {
    const byAsset = rolesBySlug.get(entity.assetKey);
    if (byAsset?.avatarUrl) {
      return resolveMediaUrl(byAsset.avatarUrl) ?? PLACEHOLDER_AVATAR;
    }
  }
  return PLACEHOLDER_AVATAR;
}

function displayNameFor(
  beat: NarrativeBeat,
  rolesBySlug: Map<string, RolePillOption>,
  world: WorldState | null,
): string {
  if (beat.actorName) return beat.actorName;
  if (beat.actorId) {
    const role = rolesBySlug.get(beat.actorId);
    if (role) return role.name;
    const entity = world?.entities[beat.actorId];
    if (entity?.name) return entity.name;
    return beat.actorId;
  }
  return '旁白';
}

export function ChatShell({ conversationId }: { readonly conversationId: number }) {
  const timeline = useTimeline(conversationId);
  const worldQuery = useWorld(conversationId);
  const rolesQuery = useRoles();
  const client = useQueryClient();
  const { setPlayedRole, isPending: playedPending } = useSetPlayedRole();
  const {
    phase: turnPhase,
    submit: submitTurn,
    lastError,
    lastResult,
  } = useTurnQueue(conversationId);
  const chatAction = useChatEndpointApiConversationsConversationIdChatPost();

  const [content, setContent] = useState('');
  const [targetActorId, setTargetActorId] = useState('');
  const [controlsOpen, setControlsOpen] = useState(true);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const turnBusy =
    turnPhase === 'optimistic' || turnPhase === 'in_flight' || turnPhase === 'applying';

  const world = useMemo<WorldState | null>(
    () => worldQuery.data?.worldState ?? null,
    [worldQuery.data],
  );

  const roleList = useMemo<readonly RoleOut[]>(() => rolesQuery.data ?? [], [rolesQuery.data]);

  const pills = useMemo(() => roleList.map(roleOutToPill), [roleList]);
  const playablePills = useMemo(
    () =>
      pills.filter((p) => {
        const role = roleList.find((r) => (r.slug ?? String(r.id)) === p.slug);
        return Boolean(role?.inGame);
      }),
    [pills, roleList],
  );
  const rolesBySlug = useMemo(() => new Map(pills.map((p) => [p.slug, p])), [pills]);

  const playedActorId = world?.playerActorId ?? playablePills[0]?.slug ?? 'player';

  useEffect(() => {
    if (pills.length === 0) return;
    const exists = pills.some((p) => p.slug === targetActorId);
    if (!exists) {
      const fallback =
        pills.find((p) => p.slug !== playedActorId)?.slug ?? pills[0]?.slug ?? targetActorId;
      setTargetActorId(fallback);
    }
  }, [pills, targetActorId, playedActorId]);

  const entries = useMemo<readonly TimelineEntry[]>(() => timeline.data ?? [], [timeline.data]);

  const beats = useMemo(() => {
    const lookup = (id: string): string | null => {
      if (!world) return null;
      return world.entities[id]?.name ?? rolesBySlug.get(id)?.name ?? null;
    };
    return projectTimeline([...entries], lookup);
  }, [entries, world, rolesBySlug]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [beats.length]);

  useEffect(() => {
    if (!lastResult) return;

    if (lastResult.kind === 'ok') {
      const worldState = lastResult.worldState;
      client.setQueryData(
        queryKeys.conversation.world(conversationId),
        (prev: ConversationWorldRead | undefined) => ({
          ...(prev ?? {
            mapId: worldState.mapId,
            stateVersion: worldState.stateVersion,
            worldState,
          }),
          mapId: worldState.mapId,
          stateVersion: lastResult.stateVersion,
          worldState,
        }),
      );
      client.setQueryData(
        queryKeys.conversation.timeline(conversationId),
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
      const worldState = lastResult.worldState;
      client.setQueryData(
        queryKeys.conversation.world(conversationId),
        (prev: ConversationWorldRead | undefined) => ({
          ...(prev ?? {
            mapId: worldState.mapId,
            stateVersion: worldState.stateVersion,
            worldState,
          }),
          mapId: worldState.mapId,
          stateVersion: lastResult.currentStateVersion,
          worldState,
        }),
      );
    }
  }, [client, conversationId, lastResult]);

  const currentScene = useMemo(() => {
    for (let i = beats.length - 1; i >= 0; i -= 1) {
      const beat = beats[i];
      if (beat?.kind === 'scene' && beat.content.trim()) return beat.content.trim();
    }
    return '未设置场景';
  }, [beats]);

  const playedName = rolesBySlug.get(playedActorId)?.name ?? playedActorId;
  const targetName = rolesBySlug.get(targetActorId)?.name ?? targetActorId;

  async function handlePlayedChange(slug: string) {
    if (slug === playedActorId) return;
    await setPlayedRole({ conversationId, actorId: slug });
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || turnBusy || !world) return;

    submitTurn({ expectedStateVersion: world.stateVersion }, async (action) => {
      if (action.expectedStateVersion === undefined) {
        throw new Error('state_version_required');
      }
      const turn = await chatAction.mutateAsync({
        conversationId,
        data: {
          targetActorId,
          content: trimmed,
          stateVersion: action.expectedStateVersion,
        },
      });
      return {
        kind: 'ok' as const,
        worldState: turn.worldState,
        timelineDelta: turn.timelineDelta ?? [],
        stateVersion: turn.stateVersion,
      };
    });
    setContent('');
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <section
      aria-label="聊天戏文"
      aria-busy={turnBusy}
      data-turn-phase={turnPhase}
      style={shellStyle}
      data-testid="chat-shell"
    >
      <div style={messagesStyle} data-testid="chat-timeline" role="log" aria-live="polite">
        {beats.length === 0 ? (
          <div style={emptyStyle} data-testid="chat-empty">
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-serif)',
                fontSize: 'var(--text-size-2xl)',
                color: 'var(--color-text-secondary)',
              }}
            >
              舞台已就绪
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 'var(--text-size-base)',
                color: 'var(--color-text-muted)',
              }}
            >
              写下第一句台词，故事会从你按下发送的瞬间开始。
            </p>
          </div>
        ) : (
          beats.map((beat) => {
            const isScene = beat.kind === 'scene';
            const isPlayer = !isScene && beat.actorId !== null && beat.actorId === playedActorId;
            const name = displayNameFor(beat, rolesBySlug, world);
            const avatar = avatarFor(beat.actorId, rolesBySlug, world);
            const showTts =
              !isScene && !isPlayer && Boolean(beat.content.trim()) && Boolean(beat.actorId);

            if (isScene) {
              return (
                <div
                  key={String(beat.id)}
                  style={{
                    alignSelf: 'center',
                    width: '100%',
                    maxWidth: 980,
                    textAlign: 'center',
                    color: 'var(--color-text-secondary)',
                    fontFamily: 'var(--font-serif)',
                    fontStyle: 'italic',
                    fontSize: 'var(--text-size-sm)',
                    padding: 'var(--size-spacing-2)',
                  }}
                >
                  场景：{beat.content}
                </div>
              );
            }

            return (
              <article
                key={String(beat.id)}
                style={{
                  display: 'flex',
                  flexDirection: isPlayer ? 'row-reverse' : 'row',
                  alignItems: 'flex-start',
                  gap: 'var(--size-spacing-2)',
                  alignSelf: isPlayer ? 'flex-end' : 'flex-start',
                  width: 'fit-content',
                  maxWidth: 'min(760px, 88%)',
                  marginLeft: isPlayer ? undefined : 'clamp(10px, 3vw, 42px)',
                  marginRight: isPlayer ? 'clamp(10px, 3vw, 42px)' : undefined,
                  textAlign: isPlayer ? 'right' : 'left',
                }}
                data-kind={beat.kind}
                data-actor={beat.actorId ?? undefined}
              >
                <img
                  src={avatar}
                  alt=""
                  width={42}
                  height={42}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 'var(--radius-full)',
                    objectFit: 'cover',
                    flexShrink: 0,
                    boxShadow: 'var(--shadow-sm)',
                  }}
                  onError={(e) => {
                    e.currentTarget.src = PLACEHOLDER_AVATAR;
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: isPlayer ? 'flex-end' : 'space-between',
                      gap: 'var(--size-spacing-2)',
                      marginBottom: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.79rem',
                        fontWeight: 600,
                        letterSpacing: 0.2,
                        opacity: 0.8,
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {name}
                    </span>
                    {showTts && beat.actorId ? (
                      <TtsButton text={beat.content} assistantRole={beat.actorId} size="sm" />
                    ) : null}
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--text-size-base)',
                      lineHeight: 'var(--text-line-height-relaxed)',
                      color: 'var(--color-text-primary)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {beat.content}
                  </div>
                </div>
              </article>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form
        style={composerStyle}
        onSubmit={(e) => void submit(e)}
        aria-label="发送消息"
        data-testid="chat-composer"
      >
        {controlsOpen ? (
          <div style={directorStyle} data-testid="chat-director">
            <div style={roleBioStyle}>
              <CircleRoleSelector
                label="扮演角色"
                value={playedActorId}
                options={playablePills.length > 0 ? playablePills : pills}
                onChange={(slug) => void handlePlayedChange(slug)}
                disabled={playedPending}
                testId="chat-played-role"
                preferredPlacement="above"
              />
            </div>
            <div style={roleBioStyle}>
              <CircleRoleSelector
                label="对话角色"
                value={targetActorId}
                options={pills}
                onChange={setTargetActorId}
                testId="chat-target-role"
                preferredPlacement="above"
              />
            </div>
            <div style={roleBioStyle}>
              <span
                style={{
                  fontSize: 'var(--text-size-xs)',
                  color: 'var(--color-text-secondary)',
                  letterSpacing: '0.04em',
                }}
              >
                场景信息
              </span>
              <p
                style={{
                  margin: 'var(--size-spacing-2) 0 0',
                  fontSize: 'var(--text-size-sm)',
                  color: 'var(--color-text-primary)',
                }}
              >
                {currentScene}
              </p>
            </div>
          </div>
        ) : null}

        <div style={inputRowStyle}>
          <IconButton
            type="button"
            variant="secondary"
            size="md"
            aria-label={controlsOpen ? '隐藏控制面板' : '显示控制面板'}
            aria-pressed={controlsOpen}
            onClick={() => setControlsOpen((v) => !v)}
            data-testid="chat-controls-toggle"
            style={{ borderRadius: 'var(--radius-full)', flexShrink: 0 }}
          >
            ⚙
          </IconButton>
          <textarea
            ref={inputRef}
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`以“${playedName}”身份，回应“${targetName}”…`}
            aria-label="聊天消息输入框"
            name="chat-message"
            autoComplete="off"
            spellCheck={false}
            rows={1}
            style={textareaStyle}
            data-testid="chat-input"
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={turnBusy}
            disabled={!content.trim() || turnBusy || !world}
            aria-label="发送消息"
            data-testid="chat-send"
            style={{ flexShrink: 0, minWidth: 112 }}
          >
            发送台词
          </Button>
        </div>
        {lastError ? (
          <p
            role="alert"
            data-testid="chat-shell-error"
            style={{
              margin: 'var(--size-spacing-2) 0 0',
              fontSize: 'var(--text-size-sm)',
              color: 'var(--color-lacquer)',
            }}
          >
            {lastError.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}

export default ChatShell;
