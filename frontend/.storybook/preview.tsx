import type { Preview } from '@storybook/react';
import './preview.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    layout: 'centered',
    backgrounds: {
      default: 'paper',
      values: [
        { name: 'paper', value: '#f4e4c1' },
        { name: 'ink', value: '#1a1410' },
        { name: 'lacquer', value: '#8b1a1a' },
        { name: 'lantern', value: '#ffb060' },
      ],
    },
    viewport: {
      viewports: {
        mobile: {
          name: 'Mobile (375x667)',
          styles: { width: '375px', height: '667px' },
        },
        tablet: {
          name: 'Tablet (768x1024)',
          styles: { width: '768px', height: '1024px' },
        },
        desktop1080: {
          name: 'Desktop 1080p (1920x1080)',
          styles: { width: '1920px', height: '1080px' },
        },
        desktop1440: {
          name: 'Desktop 1440p (2560x1440)',
          styles: { width: '2560px', height: '1440px' },
        },
        desktop4k: {
          name: 'Desktop 4K (3840x2160)',
          styles: { width: '3840px', height: '2160px' },
        },
      },
    },
    a11y: {
      config: {
        rules: [{ id: 'color-contrast', enabled: true }],
      },
    },
  },
  globalTypes: {
    theme: {
      name: 'Theme',
      description: '主题切换',
      defaultValue: 'light',
      toolbar: {
        icon: 'circlehollow',
        items: [
          { value: 'light', icon: 'sun', title: 'Light (宣纸)' },
          { value: 'dark', icon: 'moon', title: 'Dark (墨底)' },
        ],
        dynamicTitle: true,
      },
    },
  },
};

export default preview;
