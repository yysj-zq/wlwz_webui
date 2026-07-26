import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import {
  Button,
  Dialog,
  DropdownMenu,
  IconButton,
  ScrollArea,
  Tabs,
  ToastProvider,
  ToastViewport,
  Tooltip,
} from './primitives';
import { Body, Heading, Narrative } from './typography';
import {
  BeatInPattern,
  BreathingPattern,
  CurtainPattern,
  Dock,
  Panel,
  PanelBody,
  PanelHeader,
  RoleBadge,
  SpeechBubble,
} from './patterns';
import { tokens } from './tokens';

const meta = {
  title: 'Design System/Overview',
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function PrimitivesDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 'var(--size-spacing-4)', minWidth: 320 }}>
      <div style={{ display: 'flex', gap: 'var(--size-spacing-2)', flexWrap: 'wrap' }}>
        <Button>确认</Button>
        <Button variant="secondary">次要</Button>
        <Button variant="ghost">幽灵</Button>
        <IconButton aria-label="关闭">×</IconButton>
      </div>
      <Tooltip.Root>
        <Tooltip.Trigger>
          <Button variant="secondary">悬停提示</Button>
        </Tooltip.Trigger>
        <Tooltip.Content>这是 Tooltip</Tooltip.Content>
      </Tooltip.Root>
      <Button onClick={() => setOpen(true)}>打开 Dialog</Button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>确认操作</Dialog.Title>
              <Dialog.Close />
            </Dialog.Header>
            <Dialog.Body>Dialog 内置焦点陷阱与 Escape 关闭。</Dialog.Body>
            <Dialog.Footer>
              <Button onClick={() => setOpen(false)}>完成</Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button variant="secondary">Dropdown</Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Label>操作</DropdownMenu.Label>
          <DropdownMenu.Item id="view" onSelect={() => undefined}>
            查看
          </DropdownMenu.Item>
          <DropdownMenu.Item id="edit" onSelect={() => undefined}>
            编辑
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item id="delete" onSelect={() => undefined}>
            删除
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <Tabs.Root defaultValue="one">
        <Tabs.List>
          <Tabs.Trigger value="one">一</Tabs.Trigger>
          <Tabs.Trigger value="two">二</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="one">第一段内容</Tabs.Content>
        <Tabs.Content value="two">第二段内容</Tabs.Content>
      </Tabs.Root>
      <ScrollArea style={{ maxHeight: 80 }}>
        <div>
          ScrollArea 内容。
          {Array.from({ length: 6 }, (_, i) => (
            <p key={i}>滚动行 {i + 1}</p>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export const Primitives: Story = { render: () => <PrimitivesDemo /> };

export const Patterns: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--size-spacing-4)', minWidth: 360 }}>
      <Panel elevated>
        <PanelHeader>
          <Heading size="lg">同福客栈</Heading>
        </PanelHeader>
        <PanelBody>
          <SpeechBubble actor="白展堂" actorTone="npc">
            客官里面请。
          </SpeechBubble>
          <BeatInPattern kind="act" index={1}>
            节拍入场内容
          </BeatInPattern>
          <RoleBadge name="白展堂" subtitle="NPC" tone="npc" online />
        </PanelBody>
      </Panel>
      <Dock open position="inline">
        <Button>移动</Button>
        <Button variant="secondary">交谈</Button>
      </Dock>
      <BreathingPattern active label="等待回合" />
      <CurtainPattern phase="open">
        <Body>场景内容</Body>
      </CurtainPattern>
    </div>
  ),
};

export const Typography: Story = {
  render: () => (
    <div style={{ maxWidth: '36em', display: 'grid', gap: 'var(--size-spacing-3)' }}>
      <Heading>Design System</Heading>
      <Narrative>这是叙事字体与 32–40 字每行规范的示例。</Narrative>
      <Body>现代人文无衬线用于界面正文，保持清晰的层级和舒适的阅读节奏。</Body>
    </div>
  ),
};

export const Toasts: Story = {
  render: () => (
    <ToastProvider>
      <Button onClick={() => undefined}>触发 Toast（接入 useToast）</Button>
      <ToastViewport />
    </ToastProvider>
  ),
};

export const Tokens: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--size-spacing-3)' }}>
      <Heading>Design Tokens</Heading>
      {Object.entries(tokens.color.brand).map(([name, value]) => (
        <div
          key={name}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--size-spacing-2)' }}
        >
          <span
            style={{
              width: 32,
              height: 32,
              background: `var(--${value})`,
              borderRadius: 'var(--radius-sm)',
            }}
          />
          <code>
            {name}: {value}
          </code>
        </div>
      ))}
    </div>
  ),
};
