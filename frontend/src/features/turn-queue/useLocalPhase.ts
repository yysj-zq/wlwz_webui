/**
 * useLocalPhase —— SSE 延期期间用 TurnQueue 相位驱动 HUD。
 * 必须绑定 conversationId，避免串台。
 */
import { useEffect, useRef, useState } from 'react';
import { useTurnQueue } from './useTurnQueue';

export type LocalHudPhase = 'idle' | 'thinking' | 'speaking' | 'commit' | 'done';

const SPEAKING_AFTER_MS = 450;
const DONE_HOLD_MS = 520;

export type UseLocalPhase = {
  readonly phase: LocalHudPhase;
};

export function useLocalPhase(conversationId: number | null | undefined): UseLocalPhase {
  const { phase: turnPhase, pending } = useTurnQueue(conversationId);
  const [phase, setPhase] = useState<LocalHudPhase>('idle');
  const hadActiveTurnRef = useRef(false);

  useEffect(() => {
    hadActiveTurnRef.current = false;
    setPhase('idle');
  }, [conversationId]);

  useEffect(() => {
    let speakingTimer: ReturnType<typeof setTimeout> | undefined;
    let doneTimer: ReturnType<typeof setTimeout> | undefined;

    const inThinking =
      turnPhase === 'optimistic' ||
      turnPhase === 'in_flight' ||
      (turnPhase === 'idle' && pending !== null);

    if (inThinking) {
      hadActiveTurnRef.current = true;
      setPhase('thinking');
      speakingTimer = setTimeout(() => {
        setPhase((prev) => (prev === 'thinking' ? 'speaking' : prev));
      }, SPEAKING_AFTER_MS);
      return () => {
        clearTimeout(speakingTimer);
      };
    }

    if (turnPhase === 'applying') {
      hadActiveTurnRef.current = true;
      setPhase('commit');
      return;
    }

    if (turnPhase === 'error') {
      hadActiveTurnRef.current = false;
      setPhase('idle');
      return;
    }

    if (turnPhase === 'idle' && hadActiveTurnRef.current) {
      setPhase('done');
      doneTimer = setTimeout(() => {
        hadActiveTurnRef.current = false;
        setPhase('idle');
      }, DONE_HOLD_MS);
      return () => {
        clearTimeout(doneTimer);
      };
    }

    setPhase('idle');
    return;
  }, [turnPhase, pending]);

  return { phase };
}
