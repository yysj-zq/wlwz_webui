import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './primitives/Button';
import { Curtain, Breathing, BeatIn } from './motion/recipes';
import { useState } from 'react';

const meta = {
  title: 'Design System/Motion',
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function CurtainRecipeDemo() {
  const [phase, setPhase] = useState<'opening' | 'open' | 'closing'>('open');
  return (
    <div style={{ width: 360, height: 200, position: 'relative' }}>
      <Curtain phase={phase}>
        <div style={{ padding: 24, fontFamily: 'var(--font-serif)' }}>同福舞台</div>
      </Curtain>
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <Button size="sm" onClick={() => setPhase('opening')}>
          开帘
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setPhase('closing')}>
          落帘
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPhase('open')}>
          敞场
        </Button>
      </div>
    </div>
  );
}

export const CurtainRecipe: Story = {
  render: () => <CurtainRecipeDemo />,
};

export const BeatInRecipe: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 8, fontFamily: 'var(--font-serif)' }}>
      {[0, 1, 2, 3].map((i) => (
        <BeatIn key={i} index={i}>
          节拍入场 {i + 1}
        </BeatIn>
      ))}
    </div>
  ),
};

export const BreathingRecipe: Story = {
  render: () => (
    <Breathing active lantern>
      <span style={{ fontFamily: 'var(--font-ui)', color: 'var(--color-lacquer)' }}>
        候场呼吸灯
      </span>
    </Breathing>
  ),
};
