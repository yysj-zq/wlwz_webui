/**
 * 校验角色注册表契约：backend/config/roles.yaml ↔ frontend/public/assets/manifest.json
 *
 * 规则（方案 A）：
 *  1. manifest.characters 的每个 key 必须出现在 roles.yaml 的 slug 中
 *  2. roles.yaml 中 in_game=true 且 slug≠player 的角色必须出现在 manifest.characters
 *     （player 为外来扮演身份，舞台可用矩形占位，不强制 atlas）
 *  3. manifest.maps 必须包含后端 DEFAULT_MAP_ID（tongfu_inn）
 *
 * 用法：node scripts/check-asset-registry.mjs
 * exit 0 = 对齐；非 0 = 漂移
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = join(__dirname, '..');
const REPO_ROOT = join(FRONTEND_ROOT, '..');
const ROLES_YAML = join(REPO_ROOT, 'backend/config/roles.yaml');
const MANIFEST = join(FRONTEND_ROOT, 'public/assets/manifest.json');
const EXPECTED_MAP_ID = 'tongfu_inn';
const ATLAS_EXEMPT = new Set(['player']);

/**
 * 极简 YAML 子集解析：只抽 builtin_roles 下的 slug / in_game。
 * 不引入 yaml 依赖；roles.yaml 结构稳定时足够。
 */
function parseRoleSlugs(yamlText) {
  const roles = [];
  let current = null;
  for (const rawLine of yamlText.split('\n')) {
    const line = rawLine.replace(/\t/g, '  ');
    const slugMatch = line.match(/^\s+-\s+name:/);
    if (slugMatch) {
      if (current?.slug) roles.push(current);
      current = { slug: null, inGame: false };
      continue;
    }
    if (!current) continue;
    const slug = line.match(/^\s+slug:\s*"?([^"#\n]+)"?/);
    if (slug) {
      current.slug = slug[1].trim();
      continue;
    }
    const inGame = line.match(/^\s+in_game:\s*(true|false)/);
    if (inGame) {
      current.inGame = inGame[1] === 'true';
    }
  }
  if (current?.slug) roles.push(current);
  return roles;
}

function main() {
  const yamlText = readFileSync(ROLES_YAML, 'utf8');
  const roles = parseRoleSlugs(yamlText);
  if (roles.length === 0) {
    console.error(`[check-asset-registry] failed to parse any roles from ${ROLES_YAML}`);
    process.exit(2);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const manifestChars = new Set(Object.keys(manifest.characters ?? {}));
  const roleSlugs = new Set(roles.map((r) => r.slug));
  const inGameNeedAtlas = roles
    .filter((r) => r.inGame && !ATLAS_EXEMPT.has(r.slug))
    .map((r) => r.slug);

  const errors = [];

  for (const key of manifestChars) {
    if (!roleSlugs.has(key)) {
      errors.push(`manifest.characters.${key} 不在 roles.yaml slug 中`);
    }
  }

  for (const slug of inGameNeedAtlas) {
    if (!manifestChars.has(slug)) {
      errors.push(
        `roles.yaml in_game slug=${slug} 缺少 manifest.characters 条目（需 atlas 三件套）`,
      );
    }
  }

  const maps = manifest.maps ?? {};
  if (!maps[EXPECTED_MAP_ID]) {
    errors.push(`manifest.maps 缺少 ${EXPECTED_MAP_ID}（后端 DEFAULT_MAP_ID）`);
  }

  if (errors.length > 0) {
    console.error('[check-asset-registry] FAIL');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(
    `[check-asset-registry] OK — roles=${roles.length}, manifest.characters=${manifestChars.size}, map=${EXPECTED_MAP_ID}`,
  );
}

main();
