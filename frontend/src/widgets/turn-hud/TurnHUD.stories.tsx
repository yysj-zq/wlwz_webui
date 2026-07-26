import type { Meta, StoryObj } from '@storybook/react';
import { TurnHUD } from './TurnHUD';

/**
 * TurnHUD 骨架审阅 —— 本地相位模拟（SSE 延期）。
 * conversationId 为空时展示候场态。
 */
const meta = {
  title: 'Widgets/TurnHUD',
  component: TurnHUD,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof TurnHUD>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IdleSkeleton: Story = {
  args: { conversationId: null },
};
