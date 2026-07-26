/**
 * Resolve OpenAPI JSON for orval.
 *
 * Priority:
 *  1. OPENAPI_INPUT / argv path
 *  2. Repo-root ../openapi.json (from `backend make openapi`)
 *  3. Local ./openapi.json if already present
 *  4. Fetch VITE_OPENAPI_URL (default http://localhost:8081/openapi.json)
 *
 * Writes result to ./openapi.json (frontend cwd).
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');
const outPath = resolve(frontendRoot, 'openapi.json');
const repoRootSpec = resolve(frontendRoot, '..', 'openapi.json');

const explicit =
  process.env.OPENAPI_INPUT?.trim() || (process.argv[2] && process.argv[2].trim()) || '';

async function fetchSpec(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch OpenAPI from ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function writeOut(text, source) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, text, 'utf8');
  console.log(`Saved OpenAPI to ${outPath} (${text.length} bytes) from ${source}`);
}

function copyOut(fromPath, source) {
  mkdirSync(dirname(outPath), { recursive: true });
  copyFileSync(fromPath, outPath);
  console.log(`Copied OpenAPI to ${outPath} from ${source}`);
}

try {
  if (explicit) {
    const abs = resolve(frontendRoot, explicit);
    if (!existsSync(abs)) {
      console.error(`OPENAPI_INPUT not found: ${abs}`);
      process.exit(1);
    }
    copyOut(abs, abs);
  } else if (existsSync(repoRootSpec)) {
    copyOut(repoRootSpec, repoRootSpec);
  } else if (existsSync(outPath)) {
    console.log(`Using existing ${outPath}`);
  } else {
    const url = process.env.VITE_OPENAPI_URL || 'http://localhost:8081/openapi.json';
    const text = await fetchSpec(url);
    writeOut(text, url);
  }
} catch (err) {
  console.error('OpenAPI resolve error:', err);
  process.exit(1);
}
