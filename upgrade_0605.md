# 2D RPG 终态架构改造计划

## Context

当前 `2dgame-v1` 分支虽然搭起了 WorldController + LangGraph 的骨架，但实际运行时：
- prompt 体积线性增长（完整 world_state 每轮重塞）
- messages 表和 game_events 表双轨记录、recent_events 双 schema
- NPC 私有信息（memories/goal/inventory）混在 world_state.entities[*].state 里没有信息墙
- Director 只在"挑人"，价值低；Referee 节点只是空校验壳子
- move 路径靠硬编码短路

本次重构按"摘要 context + 按需查询 + 物理信息墙 + 单一时间线"的最终形态推倒重做。不考虑数据迁移、版本兼容、现有代码工作量。

## 一、数据模型

### 1.1 Conversation（保留，职责收窄）

只负责：用户归属、标题、归档状态。删除 `game_session` 的级联关系——会话与游戏不再 1:1 强绑定。

### 1.2 Timeline（新表，取代 messages + game_events）

```
id                int PK
conversation_id   FK
turn_id           str (uuid)            -- 同一回合所有条目共享
intra_turn_seq    int                   -- 回合内顺序，commit 时由 controller 分配
state_version     int                   -- 写入时的世界版本，审计用，不进 prompt
actor_id          str                   -- player | director | scene | <npc_id>
kind              enum                  -- speak | act | speak_and_act | scene
speak             text NULL             -- 自然语言文本（角色真的说出来的话或旁白）
act_patch_json    json NULL             -- WorldPatch
created_at        ts
```

**约束**：
- `speak` 不存动作的叙述化描述（"老白走向柜台" 是错的）；动作就用 `act_patch_json` 表达。
- 一条记录可同时含 `speak` + `act_patch`（kind=speak_and_act），原子表示 NPC 一次响应。
- 工具调用不写入 timeline，只在 LLM 当次调用的 working memory 里。

### 1.3 WorldState（GameSession.world_state_json）

只存公共可见：

```
{
  map_id, state_version, player_actor_id,
  entities: {
    id: {name, kind, position, direction, public_state, interactable, asset_key}
  }
}
```

**删除** `recent_events` 和 `seed_dialogue` 字段——事件流统一走 timeline，种子对话直接作为 turn 0 的 timeline 条目写入。

### 1.4 ActorMind（新表，每 NPC 一行）

```
game_session_id   FK
actor_id          str
persona           text                  -- 人设固定描述
relations_json    json                  -- {target_actor_id: relation_text}
memories_json     json                  -- [{at_version, content, importance, scope}]
goal_json         json                  -- {current, strategy, priority}
inventory_json    json                  -- {item_id: count}
updated_at        ts
PRIMARY KEY (game_session_id, actor_id)
```

物理信息墙：NPC 私货不在 WorldState 里，根本无法泄漏到其他 NPC 的 prompt。

### 1.5 WorldDigest（新表，摘要缓存）

```
game_session_id   FK PK
at_version        int                   -- 摘要对应的世界版本
summary_text      text                  -- 自然语言段
updated_at        ts
```

由独立 summarizer 维护，不是 Director 兼职。

## 二、运行时上下文

```python
class TurnContext:
    digest: str                          # WorldDigest.summary_text
    timeline: list[TimelineEntry]        # 经 compactor 处理后的完整对话历史
```

不分"历史 / 玩家本次输入"——玩家输入在 turn 起始就写入 timeline，下一步直接读 timeline 即可。
不暴露 state_version——它是 commit 时的内部一致性令牌。

## 三、Compactor（独立组件，非节点）

接口：`compact(timeline_full) -> timeline_for_prompt`。

策略：
- 最近 N 轮完整保留
- 更早内容按段摘要替换（"30 分钟前你们讨论了门口的动静..."）
- 实现：可与 summarizer 共用 LLM 调用，prompt 不同

Compactor 不是 LangGraph 节点，在 `load_turn_context` 中调用。

## 四、LangGraph 拓扑

```
START
  → ingest_player_input        # 玩家输入写入 timeline，分配 turn_id
  → load_turn_context          # 拼 digest + compacted timeline
  → director                   # tool-call 回路 → DirectorDispatch
  → fan_out_npcs               # 并行调每个 perceiver NPC
  → commit                     # WorldController 单事务
  → refresh_digest_async       # 异步触发 summarizer，不阻塞响应
  → END
```

**删除**：referee_validate 节点（校验下沉到 commit）、move 短路（Director 自然处理）。

### 4.1 Director 节点

输入：TurnContext。

行为：tool-call 循环，直到输出 DirectorDispatch。

```python
class DirectorDispatch:
    world_writes: list[WorldPatch]       # 物理世界变更（玩家位移、环境互动）
    perceivers: list[Perceiver]

class Perceiver:
    actor_id: str
    perception_reason: str               # 仅说明为何得知（物理/感知规则）
                                         # 例："3格内目击"、"听见对话"、"心声感知"
                                         # 不指导如何响应
```

Director 不再带 `suggested_focus` 或 `intent_briefs`——NPC 自决。

### 4.2 NPC 节点（fan_out_npcs 内每个并行）

输入：
- TurnContext (公共)
- self_mind = ActorMind[self.actor_id]
- perception_reason

行为：tool-call 循环，直到输出 NPCResponse。

```python
class NPCResponse:
    speak: str | None
    act_patch: WorldPatch | None
    memory_writes: list[MemoryWrite]
    goal_update: GoalPatch | None
    inventory_ops: list[InventoryOp]
```

可以全空（NPC 选择沉默）。

### 4.3 Commit 节点 → WorldController.commit_turn

```python
async def commit_turn(
    turn_id: str,
    player_entry: TimelineEntry,
    director_writes: list[WorldPatch],
    npc_responses: list[(actor_id, NPCResponse)],
    scene_note: str | None,
) -> CommittedTurn:
    # 单事务：
    # 1. 校验 stateVersion 乐观锁
    # 2. 校验所有 patch（actor 存在、白名单仅 public_state）
    # 3. apply 所有 patch 到 world_state
    # 4. 按 (玩家=0, director_writes 1..K, NPC 响应 K+1..) 分配 intra_turn_seq
    # 5. 写 timeline
    # 6. 写各 NPC ActorMind 增量
    # 7. state_version += 1
    # 8. commit
```

## 五、Tools（GameToolbox 重写）

Director / NPC 共用：
- `query_entity(actor_id)` → 公共视图
- `query_neighbors(position, radius)` → [actor_id]
- `query_timeline(filter={actors?, kinds?, since_turn?, limit?})` → [TimelineEntry]

NPC 额外：
- `query_self_memory(filter={about?, scope?, last_n?})` → [Memory]
- `query_self_goal()` → Goal
- `query_self_inventory()` → dict
- `query_relation(target_actor_id)` → str

实现策略：所有 query 都通过 WorldController 只读方法封装，禁止任何 tool 携带写能力。

## 六、Prompt 形态（对话历史风格）

### 6.1 Director

```
system:
  你是同福客栈这场戏的导演。根据物理与感知规则，判断这回合世界该怎么变、
  哪些 NPC 因物理或感知规则会得知此事而被触发响应（不指导他们如何响应）。
  当前世界摘要：{digest}

messages: [timeline 渲染]
  按时序逐条转换：
    - actor=player, kind=speak           → {role: "user", content: "玩家：{speak}"}
    - actor=player, kind=act              → {role: "user", content: "[玩家动作] {act 渲染}"}
    - actor=<npc>, kind=speak             → {role: "assistant", content: "{name}：{speak}"}
    - actor=<npc>, kind=act               → {role: "assistant", content: "[{name} 动作] {act 渲染}"}
    - actor=<npc>, kind=speak_and_act     → 一条 assistant 同时含说与做
    - actor=scene, kind=scene             → {role: "system", content: "（{speak}）"}
```

模型自决：先 tool call 还是直接给 DirectorDispatch。

### 6.2 NPC

```
system:
  你扮演 {entity.name}。严格在角色里。不要替别的角色发言。可以选择沉默。

  你是谁：{persona}
  你与他人的关系：{relations}
  你当前的目标：{goal}
  你最近的相关记忆：{recent_relevant_memories}
  当前世界摘要：{digest}
  导演触发你响应的原因：{perception_reason}

messages: [同一 timeline 渲染]
```

不存在"最近发生 / 玩家这次"的人为分段——一切按对话历史自然时序。

## 七、时序与并行

- 同一 turn 内 `intra_turn_seq` 严格递增：玩家(0) → director_writes(1..K) → NPC 响应(K+1..) 顺序由 commit 时 controller 分配。
- NPC 并行执行（asyncio.gather），响应序号在 commit 时统一分配，避免并发写顺序不确定。
- 同一 turn 所有条目共享 `state_version`（即 commit 之前的版本，commit 后 +1）。
- 下一回合读取 timeline 时按 `(turn_id, intra_turn_seq)` 稳定排序。

## 八、Digest 维护

```
refresh_digest_async 任务（不阻塞 commit 响应）：
  delta = state_version - digest.at_version
  if delta >= REFRESH_INTERVAL or 本回合有重要事件:
       summary = await summarizer_llm(
         current_world_state, recent_timeline_window
       )
       upsert WorldDigest(at_version=current_version, summary_text=summary)
```

Summarizer 是**唯一**读完整 world_state 的 LLM。Director / NPC 永远只看 digest + timeline。

## 九、关键不变量

1. WorldState 只存公共可见信息，私有信息物理上不存在 → 不可能泄漏。
2. Timeline 是唯一时间线，messages 和 game_events 两张表不再存在。
3. Timeline 的 `speak` 字段只装"角色真说的话"或"旁白真写的文字"，不装动作描述。
4. 工具调用不入 timeline，仅 LLM 当次 working memory。
5. WorldController.commit_turn 是唯一写入闸门，单事务。
6. state_version 乐观锁保证回合不冲突，不暴露给 LLM。
7. Director 只触发不指导，NPC 完全自决。

## 十、关键文件改动清单

**新增**：
- `backend/app/db/models/timeline.py` — Timeline 模型
- `backend/app/db/models/actor_mind.py` — ActorMind 模型
- `backend/app/db/models/world_digest.py` — WorldDigest 模型
- `backend/alembic/versions/<rev>_terminal_schema.py` — drop messages/game_events, create new tables
- `backend/app/services/timeline_service.py` — timeline 读写 + compactor
- `backend/app/services/digest_service.py` — summarizer + 异步刷新
- `backend/app/services/actor_mind_service.py` — NPC 私货读写
- `backend/app/agents/nodes/ingest_player.py`
- `backend/app/agents/nodes/director.py`（tool-call 回路）
- `backend/app/agents/nodes/npc.py`（tool-call 回路）
- `backend/app/agents/nodes/commit.py`
- `backend/app/agents/nodes/refresh_digest.py`
- `backend/app/agents/tools/director_tools.py`
- `backend/app/agents/tools/npc_tools.py`
- `backend/app/agents/prompt_render.py` — timeline → messages 数组渲染

**重写**：
- `backend/app/domain/world_controller.py` — commit_turn 单一入口，物理白名单
- `backend/app/api/schemas/game.py` — DirectorDispatch / Perceiver / NPCResponse / TurnContext / TimelineEntry
- `backend/app/agents/game_turn_graph.py` — 新拓扑
- `backend/app/api/routers/game.py` — 适配新响应形态
- `frontend/src/game/worldState.js` — 移除 recent_events / seed_dialogue 客户端镜像
- `frontend/src/App.js` — game action 响应改读 timeline_delta

**删除**：
- `backend/app/db/models/entities.py` 中的 Message、GameEvent、GameSession.world_state_json 的 recent_events/seed_dialogue 字段
- `backend/app/services/conversation_service.py` 的 append_messages 系列
- `backend/app/services/game_state_service.py` 的 recent_events 维护逻辑
- `backend/app/agents/nodes.py` 的 referee_validate
- `backend/app/api/schemas/session_context.py` 的旧 SessionContext

## 十一、验证步骤

1. `uv run alembic upgrade head` 闭环（包括 drop 旧表 + 新建）
2. `uv run pytest -q` 全绿，含：
   - `test_timeline_ordering` — 多 NPC 并行响应的 intra_turn_seq 单调
   - `test_actor_mind_isolation` — A 的 prompt 不含 B 的 memories
   - `test_director_dispatch_perceivers_only` — Director 输出不含指导字段
   - `test_npc_silence_allowed` — NPC 全空响应不报错
   - `test_world_patch_rejects_private_keys` — 物理白名单生效
3. `uv run mypy app` + `uv run ruff check` 全绿
4. 手测：
   - 玩家纯走 → Director 输出 world_writes=[player 位移], perceivers=[]
   - 玩家对老白说话 → Director 输出 perceivers 含老白（理由"被直接称呼"）
   - 玩家在小郭面前与老白说话 → perceivers 含老白和小郭（小郭理由"在 2 格内目击"）
5. 验证 digest：连续 N 个回合后 WorldDigest.summary_text 自动刷新，prompt 体积不随回合数线性增长。
