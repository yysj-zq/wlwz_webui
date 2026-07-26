import type { TTSRequest } from '@shared/api';
import { customInstance } from '@shared/api/mutator';

const cache = new Map<string, string>();
export async function getTtsBlob(request: TTSRequest): Promise<Blob> {
  const key = JSON.stringify(request);
  const cached = cache.get(key);
  if (cached) return fetch(cached).then((response) => response.blob());
  // OpenAPI: POST /api/tts（见 ttsApiTtsPost）；生成 client 默认 JSON，TTS 成功体为 blob，故此处直连同一路径。
  const blob = await customInstance<Blob>({
    url: '/api/tts',
    method: 'POST',
    data: request,
    responseType: 'blob',
  });
  const url = URL.createObjectURL(blob);
  cache.set(key, url);
  return blob;
}
export async function autoplayTts(request: TTSRequest): Promise<void> {
  const blob = await getTtsBlob(request);
  const audio = new Audio(URL.createObjectURL(blob));
  audio.autoplay = true;
  await audio.play();
}
