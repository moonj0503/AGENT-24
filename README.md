# Continuity Agent

An accessibility and productivity agent that preserves a confirmed task's context during a temporary interruption and gives the user a transparent recovery brief on return.

## Start here

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm --filter @continuity/api dev
```

The production desktop uses the real API workflow; fixture data is restricted to automated tests and the explicit development overlay preview. See [docs/full-desktop-workflow.md](docs/full-desktop-workflow.md) for setup, lifecycle, verification, and current limitations. The desktop does not send raw activity or API keys to OpenAI, and all actions pass through deterministic policy handling.
