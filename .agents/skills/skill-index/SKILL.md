---
name: skill-index
description: "INVOKE THIS SKILL when the agent is started from the repository root. It acts as a monorepo skill entrypoint and directs the agent to the backend/frontend skill directories."
---

## Purpose

When the agent is launched from the repository root, it may not automatically detect skills located under subprojects. This skill is the **single entrypoint** for this repo and tells the agent where to find the real skills:

- Backend skills: `backend/.agents/skills/`
- Frontend skills: `frontend/.agents/skills/`

## How to use (mandatory)

1. **Classify the user's request** into one of:
   - Backend-only
   - Frontend-only
   - Full-stack / both
2. **Then load and follow the most relevant skills** from the corresponding directory:
   - Backend work → read and follow `backend/.agents/skills/**/SKILL.md`
   - Frontend work → read and follow `frontend/.agents/skills/**/SKILL.md`
   - Full-stack work → read and follow both sides' skills, in the order that best matches the task (usually backend first, then frontend integration).
3. If it is unclear whether the request belongs to backend or frontend, **ask the user to specify the target** before implementing anything.

## Non-goals

- This skill does **not** replace backend/frontend skills.
- This skill does **not** define coding standards; it only routes the agent to the correct skill set.
