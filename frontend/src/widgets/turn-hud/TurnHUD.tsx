/**
 * TurnHUD —— 显示当前会话的本地演出相位（SSE 延期：useLocalPhase 模拟）。
 */
import { useLocalPhase, type LocalHudPhase } from '@features/turn-queue/useLocalPhase';
import { useTurnQueue } from '@features/turn-queue/useTurnQueue';

const PHASE_LABEL: Record<LocalHudPhase, string> = {
  idle: '候场',
  thinking: '思考中…',
  speaking: '开讲…',
  commit: '落幕',
  done: '过场',
};

const PHASE_TEST_ID: Record<LocalHudPhase, string> = {
  idle: 'turn-hud-idle',
  thinking: 'turn-hud-thinking',
  speaking: 'turn-hud-speaking',
  commit: 'turn-hud-commit',
  done: 'turn-hud-done',
};

export type TurnHUDProps = {
  readonly conversationId: number | null;
};

export function TurnHUD({ conversationId }: TurnHUDProps) {
  const { phase } = useLocalPhase(conversationId);
  const { lastError, phase: turnPhase } = useTurnQueue(conversationId);
  const showError = turnPhase === 'error' && lastError;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="回合进度（本地模拟，SSE 延期）"
      data-testid={showError ? 'turn-hud-error' : PHASE_TEST_ID[phase]}
      data-phase={showError ? 'error' : phase}
      style={{
        padding: '0.5rem 1rem',
        borderRadius: 4,
        background: 'var(--color-surface-1)',
        color: showError ? 'var(--color-lacquer)' : 'var(--color-text-primary)',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <strong>{showError ? '出错了' : PHASE_LABEL[phase]}</strong>
      {showError ? (
        <span style={{ marginLeft: 8, color: 'var(--color-text-muted)' }}>{lastError.message}</span>
      ) : null}
    </div>
  );
}

export default TurnHUD;
