/**
 * 场景内交互对话框 —— 对齐 `_legacy` GameView Dialog（点 NPC/物件后说话/行动）。
 * 无底部操作台；无 MUI。
 */
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Button, Dialog } from '@ds/primitives';

export interface SceneInteractDialogProps {
  readonly open: boolean;
  readonly targetName: string;
  readonly disabled?: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (text: string) => void;
}

const textareaStyle: CSSProperties = {
  width: '100%',
  minHeight: 96,
  resize: 'vertical',
  padding: 'var(--size-spacing-3)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border-default)',
  background: 'var(--color-surface-1)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-size-sm)',
  lineHeight: 1.5,
};

export function SceneInteractDialog({
  open,
  targetName,
  disabled = false,
  onClose,
  onSubmit,
}: SceneInteractDialogProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) {
      setText('');
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      onClose();
      return;
    }
    onSubmit(trimmed);
    setText('');
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Content
        data-testid="scene-interact-dialog"
        style={{ maxWidth: 420 }}
        onClose={onClose}
      >
        <Dialog.Title>与 {targetName} 交互</Dialog.Title>
        <Dialog.Description>你想说什么或做什么？</Dialog.Description>
        <form
          onSubmit={(e) => handleSubmit(e)}
          style={{
            display: 'grid',
            gap: 'var(--size-spacing-3)',
            marginTop: 'var(--size-spacing-3)',
          }}
        >
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled}
            rows={3}
            placeholder="输入台词或行动…"
            aria-label="交互内容"
            style={textareaStyle}
            data-testid="scene-interact-input"
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 'var(--size-spacing-2)',
            }}
          >
            <Button type="button" variant="ghost" onClick={onClose} disabled={disabled}>
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={disabled}
              data-testid="scene-interact-submit"
            >
              发送
            </Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export default SceneInteractDialog;
