# Game Placeholder Assets

这些文件是首期 2D RPG 垂直切片的固定资源路径。替换同一路径文件即可生效，无需改代码。

| 文件 | 尺寸 | 用途 | AI 生成提示词 |
| --- | --- | --- | --- |
| `../maps/tongfu_inn_tileset.png` | 128x128，32x32 tile | 同福客栈室内 tileset | Pixel art tileset for a Chinese ancient inn interior, top-down RPG view, wooden floor, plaster wall, red wooden pillars, doorway, window, stair edge, 32x32 tiles, transparent background, clean readable shapes, consistent warm palette, no text |
| `../maps/tongfu_inn_map.json` | 18x12 tile map | 客栈地图、碰撞层、出生点 | Tiled-compatible JSON map for a Chinese ancient inn interior, 18 by 12 tiles, 32px tile size, collision layer, interaction layer, player and NPC spawn points |
| `../ui/dialog_panel.png` | 256x256 | 对话面板九宫格源图 | Pixel art UI dialogue panel for a Chinese ancient inn RPG, warm wood and paper texture, nine-slice friendly border, transparent center, no text, 16-bit style, clean edges |
| `../ui/action_prompt.png` | 128x128 | 交互提示面板 | Small pixel art interaction prompt panel for RPG UI, parchment and dark wooden border, transparent center, no text, compact, readable on dark and light backgrounds |
| `./player.png` | 48x48 | 玩家默认占位精灵 | Pixel art player character for a top-down Chinese ancient inn RPG, blue outfit, south-facing idle pose, transparent background, 48x48 |

PixelLab 任务记录：

- topdown tileset: `7816f132-4ea4-4000-b00b-87d4b13ead20`，生成失败，当前 `../maps/tongfu_inn_tileset.png` 为程序化占位图。
- dialog panel object: `e75d4214-1f1e-481d-bd41-0e3d3bfed8a0`，已下载到 `../ui/dialog_panel.png`。
- action prompt object: `17e258f5-42cb-4608-9383-3d5915d7927a`，已下载到 `../ui/action_prompt.png`。
