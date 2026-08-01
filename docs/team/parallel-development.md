# Parallel Development Start

Member 3 freezes `packages/contracts`, fixture JSON, and this HTTP/SSE document before the four feature branches begin. Member 1 starts from `activity-events.json`; Member 2 starts from desktop mocks; Member 3 owns HTTP, persistence, and contracts; Member 4 starts from `action-plan.json` and must route every planned action through deterministic policy.

Use `feat/desktop-observer`, `feat/frontend-flow`, `feat/backend-api`, and `feat/agent-engine`. Do not modify another member's owned path. Contract changes use `chore/contracts-v2` and merge before dependent work.
