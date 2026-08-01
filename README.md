# Continuity Agent

An accessibility and productivity agent that preserves a confirmed task's context during a temporary interruption and gives the user a transparent recovery brief on return.

## Start here

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm --filter @continuity/api dev
```

The project is mock-first. Contracts and demo fixtures are frozen in `packages/contracts`; see `docs/team/parallel-development.md` before starting a feature branch. The desktop does not send raw activity or API keys to OpenAI, and all externally impactful actions require policy handling.
