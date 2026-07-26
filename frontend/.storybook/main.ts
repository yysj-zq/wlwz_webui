import type { StorybookConfig } from '@storybook/react-vite';
import { fileURLToPath, URL } from 'node:url';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-a11y', '@storybook/addon-viewport'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: { autodocs: 'tag' },
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
  },
  resolve: {
    alias: {
      '@app': fileURLToPath(new URL('../src/app', import.meta.url)),
      '@pages': fileURLToPath(new URL('../src/pages', import.meta.url)),
      '@widgets': fileURLToPath(new URL('../src/widgets', import.meta.url)),
      '@features': fileURLToPath(new URL('../src/features', import.meta.url)),
      '@entities': fileURLToPath(new URL('../src/entities', import.meta.url)),
      '@shared': fileURLToPath(new URL('../src/shared', import.meta.url)),
      '@ds': fileURLToPath(new URL('../src/design-system', import.meta.url)),
    },
  },
  staticDirs: ['../public'],
};

export default config;
