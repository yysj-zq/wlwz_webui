# 舞台资产交图约定（drop-in）

本目录文件按路径直接加载。美术交付时**同路径覆盖**即可，无需改代码或改 `manifest.json` 键名（新增实体除外）。

| 真相源 | 路径 |
|--------|------|
| 舞台路径 | `manifest.json` |
| 角色注册表（slug / spawn / 人格 / 头像） | `backend/config/roles.yaml` |
| 对齐门禁 | `pnpm check:assets`（CI 会跑） |

地图领域 ID：`tongfu_inn`。

---

## 职责边界

| 层 | 放什么 | 谁用 |
|----|--------|------|
| 前端 `public/assets` + manifest | 地图、角色图集+法线、（可选）物件贴图 | Phaser 舞台 |
| 后端 `roles.yaml` → DB | slug、姓名、人格、spawn、头像 | 世界播种、LLM、Chat / 轮盘 |

约定：

- `manifest.characters` 的 key ⊆ `roles.yaml` 的 slug
- `roles.yaml` 中 `in_game: true` 的角色应有 `manifest.characters` 三件套
- 门禁对 `player` 仍豁免「必须有 atlas」（历史：外来扮演身份可矩形占位）；**当前仓库里 player 与 baizhantang 同为正式图集，状态一致**
- 出生点只信后端 `world_state`；前端不维护 NPC spawn 列表
- 头像走 `GET /api/roles/{id}/avatar`，不在本目录放 portrait

---

## 目录结构

```
public/assets/
  manifest.json
  maps/tongfu_inn/
    map.json
    tongfu_inn.png      # imagelayer 背景
    tileset.png         # 门闸冗余（与背景同内容）
    lighting.json
    collision.json
  characters/<slug>/
    atlas.png
    atlas_normal.png
    atlas.json
  objects/              # 预留；世界物件本轮无贴图
```

---

## 状态

| 类别 | 状态 | 说明 |
|------|------|------|
| `baizhantang` / `player` | 已就绪 | 正式图集（`meta.app = webui_2-atlas-packer`） |
| 其余 in_game 角色 | 待替换 | 64×96 色块 interim（`meta.app = placeholder`） |
| 地图 `tongfu_inn` | 已就绪 | 57×31 整图背景 + 碰撞多边形 + 灯光；键盘移动会吃碰撞栅格 |
| 世界物件 | 延期 | 后端播种实体；舞台矩形占位，不要求 FE 贴图 |
| 多地图 | — | 不在近期 |

### 已就绪路径

- `characters/baizhantang/`、`characters/player/`：各 `atlas.png` + `atlas_normal.png` + `atlas.json`
- `maps/tongfu_inn/`：`tongfu_inn.png`、`map.json`（`tilesets: []`）、`collision.json`、`lighting.json`、`tileset.png`

### 待替换（美术）

每个 slug 覆盖三件套（png + normal + json），帧名对齐 `baizhantang`，帧 rect 不得超出 PNG：

`tongxiangyu` · `guofurong` · `lvxiucai` · `lidazui` · `moxiaobei` · `zhuwushuang` · `yanxiaoliu` · `xingyusen`

```bash
# 仅重建 interim 色块，勿当交图
node scripts/generate-interim-character-placeholders.mjs
pnpm check:assets
```

---

## 物件（延期）

后端世界实体 key：`counter` / `table` / `chair` / `ledger` / `abacus` / `stairs`。  
前端暂不提供对应 `objects/*.png`。  
磁盘上的 `objects/lantern-red.png` **未**挂入 manifest，不是世界实体。

将来接贴图：`asset_key` 与 `manifest.objects` key 同名，并扩展 `check:assets`。

---

## 交图 checklist

1. 路径与 `manifest.json` 一致  
2. `atlas.png` 与 `atlas_normal.png` 同宽同高  
3. `atlas.json` 帧不越界  
4. `pnpm check:assets` 通过  
5. 硬刷新即可，无需改业务代码  
