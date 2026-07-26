import { defineConfig } from 'orval';

export default defineConfig({
  webui: {
    input: {
      target: './openapi.json',
    },
    output: {
      mode: 'split',
      client: 'react-query',
      target: 'src/shared/api/generated',
      clean: true,
      // 不写死 host：OpenAPI path 已含 /api 前缀；运行时由 mutator 拼 VITE_API_BASE_URL。
      headers: true,
      override: {
        mutator: {
          path: 'src/shared/api/mutator.ts',
          name: 'customInstance',
        },
      },
    },
  },
});
