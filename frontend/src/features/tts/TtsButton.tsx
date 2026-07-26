/**
 * TTS 按钮 —— Phase 5 PP4。
 *
 * 复用 `shared/tts/tts.ts` 的 Blob 缓存与 autoplay；不另造请求层。
 */
import { useState, type CSSProperties } from 'react';
import { autoplayTts } from '@shared/tts/tts';
import { IconButton } from '@ds/primitives/IconButton';

export type TtsButtonProps = {
  /** 待朗读文本。 */
  readonly text: string;
  /** 角色 slug / 名称（查 default_speaker_id）。 */
  readonly assistantRole: string;
  /** 可选 speaker 覆盖。 */
  readonly speakerId?: string | null;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly className?: string;
  readonly style?: CSSProperties;
};

export function TtsButton({
  text,
  assistantRole,
  speakerId,
  size = 'sm',
  className,
  style,
}: TtsButtonProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const trimmed = text.trim();
  const disabled = !trimmed || !assistantRole || busy;

  async function speak() {
    if (disabled) return;
    setBusy(true);
    setFailed(false);
    try {
      await autoplayTts({
        text: trimmed,
        assistantRole,
        ...(speakerId !== undefined ? { speakerId } : {}),
      });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <IconButton
      type="button"
      variant="ghost"
      size={size}
      disabled={disabled}
      aria-label={failed ? '朗读失败，点击重试' : busy ? '正在朗读' : '朗读'}
      aria-busy={busy || undefined}
      data-testid="tts-button"
      className={className}
      style={style}
      onClick={() => void speak()}
    >
      {busy ? '…' : failed ? '!' : '声'}
    </IconButton>
  );
}
