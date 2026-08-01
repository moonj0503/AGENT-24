# Consciousness Gap Agent

> An autonomous AI agent that preserves a user’s goals and social continuity during a temporary interruption in consciousness or task flow, and continues progressing toward those goals within explicitly delegated permissions.

- Document status: Finalized hackathon MVP specification
- Date: 2026-08-01
- Target track: Track 02 — Social Impact
- Team size: 4
- Working project name: `continuity-agent`

---

## 0. Purpose of This Document

This document serves as the single source of truth for the project and consolidates the following decisions:

1. Problem definition and product concept
2. MVP scope and demo scenario
3. End-to-end pipeline architecture
4. Technology stack
5. Monorepo and file structure
6. Internal REST and SSE APIs
7. OpenAI agent and tool architecture
8. Permissions, safety, and privacy policies
9. Data models and shared contracts
10. Four-person team responsibilities
11. Conflict-free parallel development rules
12. Implementation order and completion criteria

Any change that affects shared contracts or APIs should be reflected in this document before the implementation is changed.

---

# 1. Project Overview

## 1.1 One-Sentence Definition

**Consciousness Gap Agent continuously infers the user’s current goal, safely advances that goal within delegated permissions when task continuity is interrupted, and restores the user’s thought process and social context when they return.**

## 1.2 Problem Definition

When a user temporarily becomes unable to continue an activity due to narcolepsy, sudden sleep, fainting, medication side effects, extreme fatigue, or another unexpected event, they lose more than time.

They may lose:

- The goal they were trying to achieve
- The exact stage of the task they were working on
- The reason they were reading a specific document or webpage
- An unfinished train of thought
- Messages, schedule changes, and decisions that occurred during the gap
- Social continuity with teammates, professors, managers, friends, or family

Existing software can save files, browser tabs, and meeting transcripts, but it usually cannot answer:

> “What was I trying to do, why was I doing it, and what should I continue with now?”

## 1.3 Core Value Proposition

```text
Save a file                         → Traditional software
Summarize activity                  → General AI assistant
Understand the user’s goal          → Goal Interpreter
Protect the goal during a gap       → Continuity Agent
Restore the user’s thought process  → Consciousness Gap Agent
```

## 1.4 Social Impact

The first target users are people with narcolepsy. The concept can later expand to people who experience:

- Excessive daytime sleepiness or other sleep disorders
- Fainting, seizures, or unpredictable interruptions
- Reduced alertness caused by treatment or medication
- Chronic illness and severe fatigue
- ADHD, cognitive fatigue, or difficulty recovering context after interruptions

The service does not diagnose or treat a medical condition. It is positioned as an **accessibility and productivity agent that supports independent daily life and continuity of work**.

---

# 2. Product Principles

## 2.1 Core Principles

1. The AI does not state the user’s intent as a fact. It proposes ranked goal candidates with evidence.
2. The AI does not replace the user’s core decisions. It advances goals that have already been chosen or confirmed.
3. Every action must pass through a policy engine.
4. Actions with external impact require explicit approval by default.
5. Raw activity data is processed locally whenever possible.
6. Gap detection is not a medical diagnosis; it only detects a likely interruption in task continuity.
7. The system must clearly disclose what the agent read, created, changed, or sent.
8. Trust, reversibility, and transparency are prioritized over maximum autonomy.

## 2.2 Out of Scope

The product will not:

- Diagnose narcolepsy or any other medical condition
- Make a medical judgment about consciousness
- Recommend medication or medical treatment
- Enter contracts, make payments, or provide legal consent
- Automatically send high-impact messages without approval
- Make destructive changes to original files
- Continuously record raw keystrokes or full-screen video
- Collect passwords or data from blocked applications

---

# 3. MVP Scope

## 3.1 Core MVP Flow

```text
Observe
  ↓
Goal Inference
  ↓
User Confirmation
  ↓
Checkpoint
  ↓
Gap Start
  ↓
Continuity Objective
  ↓
Plan
  ↓
Policy Check
  ↓
Execute Allowed Tools
  ↓
Recovery Brief
```

## 3.2 Features Included in the MVP

### Observation

- Detect the active application on Windows
- Detect the active window title
- Measure user idle time
- Exclude blocked applications and sensitive windows
- Generate sanitized activity events

### Goal Inference

- Generate up to three goal candidates
- Show a confidence score and evidence for each candidate
- Allow the user to select or manually correct the goal
- Store the confirmed goal as a hierarchy

### Checkpoints

Store:

- Current goal
- Current stage
- Recently completed work
- Open questions
- Likely next actions
- Related resources

### Gap Mode

- Allow the user to manually start gap mode
- Optionally suggest gap mode after extended inactivity
- Preserve the latest checkpoint when the gap begins

### Actions During the Gap

- Create a checkpoint
- Create a TODO draft
- Create a message draft
- Organize references virtually without moving original files
- Generate a recovery brief

### Recovery

Show:

- The goal before the gap
- Changes that occurred during the gap
- Actions completed by the agent
- Actions waiting for approval
- Any external effects
- One recommended next action

## 3.3 Features Excluded from the MVP

- Camera-based drowsiness detection
- Wearable biosignal integration
- Hospital or medical institution integration
- Automatic email sending
- Payments or contracts
- Full multi-platform native support
- Collection of complete browser history
- Fully autonomous computer control
- Large multi-agent systems with more than two core agents

---

# 4. Demo Scenario

## 4.1 Primary Demo Flow

1. The user edits a report in Microsoft Word.
2. The user searches for related material in Chrome.
3. The system proposes several goal candidates:
   - Write the final project report
   - Study QR factorization
   - Prepare a presentation
4. The user selects `Write the final project report`.
5. The AI stores the current stage as `Write the numerical stability section for QR factorization`.
6. The user presses the `Start Gap` button.
7. The Continuity Agent creates a temporary objective:
   - “Preserve the report-writing workflow and minimize recovery cost.”
8. The agent executes policy-approved tools:
   - Organizes relevant references
   - Creates an outline for the next paragraph
   - Summarizes new team messages
   - Creates a reply draft
9. The user returns.
10. The recovery screen displays:
   - The previous goal
   - Completed preparation tasks
   - No external messages were sent
   - Recommended next action: “Review the QR stability outline”

## 4.2 What the Demo Must Prove

- The AI infers a goal without waiting for a direct command.
- When a gap begins, the agent creates a context-specific continuity objective.
- The agent generates an action plan from the goal.
- The agent uses tools to create real outputs.
- The policy engine blocks or downgrades unsafe actions.
- The user can understand what happened and why after returning.

---

# 5. End-to-End Architecture

```mermaid
flowchart TD
    A[Desktop Activity Collector] --> B[Local Privacy Filter]
    B --> C[Session Aggregator]
    C --> D[Observation API]
    D --> E[Context Builder]
    E --> F[Goal Interpreter]
    F --> G{User Confirmation Needed?}
    G -- Yes --> H[Goal Confirmation UI]
    G -- No --> I[Goal Store]
    H --> I
    I --> J[Checkpoint Engine]
    J --> K{Gap Detected or Started?}
    K -- No --> A
    K -- Yes --> L[Continuity Agent]
    L --> M[Action Planner]
    M --> N[Policy Engine]
    N --> O{Policy Decision}
    O -- Auto --> P[Tool Executor]
    O -- Approval --> Q[Approval Queue]
    O -- Downgrade --> R[Safer Alternative Tool]
    O -- Deny --> S[Audit Log]
    Q --> P
    R --> P
    P --> T[Action Results]
    T --> U[Recovery Pipeline]
    S --> U
    U --> V[Recovery Brief UI]
```

## 5.1 Responsibility Separation

### Deterministic Code Responsibilities

- Detect operating-system activity
- Measure idle time
- Redact sensitive information
- Validate API requests and responses
- Evaluate permissions and policy rules
- Execute real tools
- Persist state
- Roll back reversible actions
- Write audit logs

### AI Responsibilities

- Infer goal candidates
- Suggest a goal hierarchy
- Estimate the current stage and unfinished thought process
- Create a continuity objective during a gap
- Generate possible action plans
- Produce the recovery brief

## 5.2 Critical Safety Boundary

```text
Continuity Agent
      ↓ proposes an action
Policy Engine
      ↓ allows, requires approval, downgrades, or denies
Tool Executor
      ↓ performs the real action
Audit Log
```

The model never receives unrestricted authority to execute external actions directly.

## 5.3 Desktop Window Architecture

The desktop application uses two Tauri windows that share the same React codebase, API client, Zustand state, and backend contracts.

```text
Desktop Application
├─ Main Window
│  ├─ Dashboard
│  ├─ Full Gap Status
│  ├─ Full Recovery Brief
│  ├─ History
│  └─ Permission Settings
│
└─ Quick Overlay Window
   ├─ Goal Confirmation
   ├─ Gap Start Confirmation
   ├─ Approval Request
   └─ Recovery Notification
   ```
   
---

# 6. Technology Stack

## 6.1 Final Stack

| Area | Technology | Purpose |
|---|---|---|
| Monorepo | pnpm Workspace + Turborepo | Manage apps and shared packages |
| Desktop runtime | Tauri 2 | Native desktop integration and packaging |
| Native layer | Rust | Active-window detection, idle time, privacy filtering |
| Desktop frontend | React + Vite + TypeScript | User interface |
| UI system | Tailwind CSS + shadcn/ui | Fast MVP interface development |
| Local UI state | Zustand | Goal, gap, and permission state |
| Server state | TanStack Query | REST caching and asynchronous state |
| Backend | Node.js + Fastify + TypeScript | REST, SSE, and agent orchestration |
| Runtime validation | Zod v4 | Validate APIs and structured AI outputs |
| Agent framework | OpenAI Agents SDK for TypeScript | Agent loop, tools, approvals, tracing |
| Model API | OpenAI Responses API | Structured output and function tools |
| Cloud database | PostgreSQL + Drizzle ORM | Persist service state |
| Local database | SQLite | Store raw activity events locally |
| Unit tests | Vitest + Cargo Test | TypeScript and Rust tests |
| End-to-end tests | Playwright | Verify the full user flow |
| API documentation | OpenAPI 3.1 | Document contracts |

## 6.2 Model Configuration

Model names are configured through environment variables rather than hard-coded in source files.

```env
OPENAI_GOAL_MODEL=gpt-5-mini
OPENAI_CONTINUITY_MODEL=gpt-5.1
OPENAI_RECOVERY_MODEL=gpt-5-mini
```

Operational guidelines:

- Goal inference and checkpoints: faster, lower-cost model
- Continuity planning and tool selection: stronger agent-oriented model
- Confirm actual model availability through the project account before the hackathon
- Revalidate structured outputs and latency before the final demo

## 6.3 Communication Protocols

| Connection | Protocol |
|---|---|
| React ↔ Rust | Tauri IPC |
| Desktop ↔ Backend | HTTPS REST JSON |
| Backend → Desktop status updates | Server-Sent Events (SSE) |
| Backend ↔ OpenAI | Agents SDK / Responses API |
| Backend ↔ PostgreSQL | Drizzle ORM |

WebSocket is not required for the MVP because the main real-time flow is one-way server-to-client status streaming.

---

# 7. Monorepo File Structure

```text
continuity-agent/
├─ apps/
│  ├─ desktop/
│  │  ├─ src/
│  │  │  ├─ app/
│  │  │  │  ├─ App.tsx
│  │  │  │  ├─ router.tsx
│  │  │  │  └─ providers.tsx
│  │  │  ├─ features/
│  │  │  │  ├─ activity/
│  │  │  │  ├─ goals/
│  │  │  │  ├─ checkpoints/
│  │  │  │  ├─ gap/
│  │  │  │  ├─ actions/
│  │  │  │  ├─ recovery/
│  │  │  │  └─ permissions/
│  │  │  ├─ components/
│  │  │  │  ├─ ui/
│  │  │  │  ├─ layout/
│  │  │  │  └─ common/
│  │  │  ├─ lib/
│  │  │  │  ├─ api-client.ts
│  │  │  │  ├─ tauri.ts
│  │  │  │  ├─ query-client.ts
│  │  │  │  └─ logger.ts
│  │  │  ├─ mocks/
│  │  │  │  ├─ goal-candidates.json
│  │  │  │  ├─ gap-session.json
│  │  │  │  ├─ action-plan.json
│  │  │  │  └─ recovery-brief.json
│  │  │  ├─ overlay/
│  │  │  │  ├─ OverlayApp.tsx
│  │  │  │  ├─ OverlayRouter.tsx
│  │  │  │  ├─ OverlayRoot.tsx
│  │  │  │  └─ components/
│  │  │  │     ├─ GoalConfirmationOverlay.tsx
│  │  │  │     ├─ GapStartOverlay.tsx
│  │  │  │     ├─ ApprovalOverlay.tsx
│  │  │  │     └─ RecoveryNotificationOverlay.tsx
│  │  │  ├─ pages/
│  │  │  │  ├─ DashboardPage.tsx
│  │  │  │  ├─ RecoveryPage.tsx
│  │  │  │  ├─ HistoryPage.tsx
│  │  │  │  └─ SettingsPage.tsx
│  │  │  ├─ styles/globals.css
│  │  │  └─ main.tsx
│  │  ├─ src-tauri/
│  │  │  ├─ src/
│  │  │  │  ├─ commands/
│  │  │  │  │  ├─ activity.rs
│  │  │  │  │  ├─ privacy.rs
│  │  │  │  │  ├─ overlay.rs
│  │  │  │  │  └─ mod.rs
│  │  │  │  ├─ observer/
│  │  │  │  │  ├─ active_window.rs
│  │  │  │  │  ├─ idle_time.rs
│  │  │  │  │  ├─ session.rs
│  │  │  │  │  └─ mod.rs
│  │  │  │  ├─ privacy/
│  │  │  │  │  ├─ filter.rs
│  │  │  │  │  ├─ redactor.rs
│  │  │  │  │  ├─ blocked_apps.rs
│  │  │  │  │  └─ mod.rs
│  │  │  │  ├─ storage/
│  │  │  │  │  ├─ database.rs
│  │  │  │  │  ├─ activity_repository.rs
│  │  │  │  │  └─ mod.rs
│  │  │  │  ├─ platform/
│  │  │  │  │  ├─ windows.rs
│  │  │  │  │  ├─ macos.rs
│  │  │  │  │  ├─ linux.rs
│  │  │  │  │  └─ mod.rs
│  │  │  │  ├─ models/
│  │  │  │  │  ├─ activity_event.rs
│  │  │  │  │  └─ work_session.rs
│  │  │  │  ├─ error.rs
│  │  │  │  ├─ state.rs
│  │  │  │  ├─ lib.rs
│  │  │  │  └─ main.rs
│  │  │  ├─ migrations/0001_activity_events.sql
│  │  │  ├─ capabilities/default.json
│  │  │  ├─ Cargo.toml
│  │  │  └─ tauri.conf.json
│  │  ├─ package.json
│  │  ├─ vite.config.ts
│  │  └─ tsconfig.json
│  └─ api/
│     ├─ src/
│     │  ├─ app.ts
│     │  ├─ server.ts
│     │  ├─ config/
│     │  │  ├─ env.ts
│     │  │  └─ constants.ts
│     │  ├─ plugins/
│     │  │  ├─ database.ts
│     │  │  ├─ cors.ts
│     │  │  └─ error-handler.ts
│     │  ├─ features/
│     │  │  ├─ observations/
│     │  │  ├─ work-sessions/
│     │  │  ├─ goals/
│     │  │  ├─ checkpoints/
│     │  │  ├─ gaps/
│     │  │  ├─ actions/
│     │  │  ├─ recovery/
│     │  │  ├─ permissions/
│     │  │  └─ system/
│     │  ├─ agents/
│     │  │  ├─ goal-interpreter/
│     │  │  │  ├─ agent.ts
│     │  │  │  ├─ instructions.ts
│     │  │  │  ├─ output-schema.ts
│     │  │  │  └─ run.ts
│     │  │  ├─ continuity/
│     │  │  │  ├─ agent.ts
│     │  │  │  ├─ instructions.ts
│     │  │  │  ├─ output-schema.ts
│     │  │  │  └─ run.ts
│     │  │  ├─ guardrails/
│     │  │  ├─ context/
│     │  │  └─ tracing/
│     │  ├─ tools/
│     │  │  ├─ registry.ts
│     │  │  ├─ create-checkpoint.tool.ts
│     │  │  ├─ create-todo-draft.tool.ts
│     │  │  ├─ create-message-draft.tool.ts
│     │  │  ├─ organize-references.tool.ts
│     │  │  └─ generate-recovery-brief.tool.ts
│     │  ├─ policy/
│     │  │  ├─ permission-profile.ts
│     │  │  ├─ risk-classifier.ts
│     │  │  ├─ policy-engine.ts
│     │  │  └─ policy-rules.ts
│     │  └─ shared/
│     ├─ tests/
│     │  ├─ agents/
│     │  ├─ integration/
│     │  └─ fixtures/
│     ├─ package.json
│     └─ tsconfig.json
├─ packages/
│  ├─ contracts/
│  │  ├─ src/
│  │  │  ├─ activity.ts
│  │  │  ├─ work-session.ts
│  │  │  ├─ goal.ts
│  │  │  ├─ checkpoint.ts
│  │  │  ├─ gap.ts
│  │  │  ├─ action.ts
│  │  │  ├─ recovery.ts
│  │  │  ├─ permission.ts
│  │  │  └─ index.ts
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  ├─ db/
│  │  ├─ src/
│  │  │  ├─ schema/
│  │  │  ├─ client.ts
│  │  │  └─ index.ts
│  │  ├─ migrations/
│  │  ├─ drizzle.config.ts
│  │  └─ package.json
│  └─ config/
├─ docs/
│  ├─ architecture/
│  ├─ adr/
│  └─ api/
├─ scripts/
├─ .github/
│  ├─ CODEOWNERS
│  └─ workflows/ci.yml
├─ .env.example
├─ .gitignore
├─ AGENTS.md
├─ README.md
├─ package.json
├─ pnpm-lock.yaml
├─ pnpm-workspace.yaml
├─ turbo.json
└─ tsconfig.base.json
```

---

# 8. Dependency Rules

```text
Desktop React
  → may depend on packages/contracts
  → must not depend directly on packages/db
  → must not import agent internals

src-tauri
  → owns local observation and privacy processing
  → must not call OpenAI directly

api/features
  → may depend on contracts and db
  → must not depend on desktop code

api/agents
  → may depend on contracts and tool interfaces
  → must not call HTTP routes directly

api/tools
  → only execute after Policy Engine approval

policy
  → remains deterministic and independent from the model
```

## 8.1 Shared File Ownership

| Shared Area | Final Owner |
|---|---|
| Root `package.json`, lockfile, workspace settings | Member 3 |
| `packages/contracts/**` | Member 3 |
| `packages/db/**` and migrations | Member 3 |
| API route registration in `apps/api/src/app.ts` | Member 3 |
| `apps/api/src/tools/registry.ts` | Member 4 |
| React router and providers | Member 2 |
| Tauri configuration and capabilities | Member 1 |

---

# 9. Shared Domain Contracts

All shared contracts are defined in `packages/contracts` using Zod schemas and TypeScript types.

## 9.1 ActivityEvent

```typescript
export type ActivityEventType =
  | "ACTIVE_WINDOW_CHANGED"
  | "APPLICATION_OPENED"
  | "APPLICATION_CLOSED"
  | "DOCUMENT_SAVED"
  | "BROWSER_TAB_CHANGED"
  | "USER_ACTIVITY"
  | "USER_IDLE"
  | "CALENDAR_EVENT_APPROACHING"
  | "MANUAL_CHECKPOINT";

export interface ActivityEvent {
  eventId: string;
  type: ActivityEventType;
  occurredAt: string;
  application: {
    name: string;
    category: "DOCUMENT" | "BROWSER" | "COMMUNICATION" | "OTHER";
  };
  resource?: {
    title: string;
    kind: "DOCUMENT" | "WEB_PAGE" | "CHAT" | "OTHER";
  };
  metadata: {
    idleSeconds: number;
  };
}
```

## 9.2 GoalCandidate

```typescript
export interface GoalEvidence {
  type:
    | "RESOURCE"
    | "ACTIVITY_SEQUENCE"
    | "CALENDAR"
    | "PREVIOUS_GOAL"
    | "USER_PATTERN";
  description: string;
}

export interface GoalCandidate {
  candidateId: string;
  title: string;
  description: string;
  confidence: number;
  evidence: GoalEvidence[];
  suggestedGoalPath: string[];
}

export interface GoalInferenceResult {
  inferenceId: string;
  candidates: GoalCandidate[];
  requiresConfirmation: boolean;
  inferenceSummary: string;
}
```

## 9.3 Goal

```typescript
export type GoalStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "PAUSED";

export interface Goal {
  goalId: string;
  title: string;
  path: string[];
  status: GoalStatus;
  source: "USER_CONFIRMED" | "USER_CREATED" | "AI_INFERRED";
  confidence: number;
}
```

## 9.4 Checkpoint

```typescript
export interface Checkpoint {
  checkpointId: string;
  goalId: string;
  currentState: string;
  completedSincePrevious: string[];
  openQuestions: string[];
  likelyNextActions: Array<{
    title: string;
    estimatedMinutes: number;
  }>;
  relatedResources: Array<{
    title: string;
    kind: string;
  }>;
  confidence: number;
  createdAt: string;
}
```

## 9.5 GapSession

```typescript
export type GapStatus =
  | "PLANNING"
  | "EXECUTING"
  | "WAITING_APPROVAL"
  | "RECOVERING"
  | "COMPLETED"
  | "FAILED";

export interface GapSession {
  gapId: string;
  workSessionId: string;
  goalId: string;
  checkpointId: string;
  status: GapStatus;
  startedAt: string;
  endedAt?: string;
}
```

## 9.6 PlannedAction

```typescript
export type ActionStatus =
  | "PLANNED"
  | "POLICY_CHECKING"
  | "WAITING_APPROVAL"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED"
  | "REJECTED"
  | "ROLLED_BACK";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "PROHIBITED";

export interface PlannedAction {
  actionId: string;
  toolName: string;
  title: string;
  reason: string;
  riskLevel: RiskLevel;
  approval: "NOT_REQUIRED" | "REQUIRED" | "DENIED";
  status: ActionStatus;
  reversible: boolean;
}
```

## 9.7 RecoveryBrief

```typescript
export interface RecoveryBrief {
  recoveryBriefId: string;
  gapId: string;
  gapDurationSeconds: number;
  beforeGap: {
    goalPath: string[];
    currentState: string;
  };
  changesDuringGap: Array<{
    type: string;
    summary: string;
  }>;
  completedActions: Array<{
    title: string;
    resourceId?: string;
  }>;
  pendingApprovals: Array<{
    actionId: string;
    title: string;
  }>;
  externalEffects: Array<{
    type: string;
    target: string;
    summary: string;
  }>;
  recommendedNextAction: {
    title: string;
    estimatedMinutes: number;
    reason: string;
  };
}
```

---

# 10. API Design

## 10.1 Common Rules

- Base path: `/api/v1`
- Content type: `application/json`
- IDs: prefixed ULIDs
- Server timestamps: UTC ISO 8601
- UI timestamps: converted to the user’s local timezone
- Retry-safe requests: use `Idempotency-Key`

### Common Headers

```http
Content-Type: application/json
X-Device-Id: dev_01J...
X-Request-Id: req_01J...
Idempotency-Key: 01J...
```

### Common Error Response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request payload is invalid.",
    "requestId": "req_01J...",
    "details": {}
  }
}
```

## 10.2 Endpoint List

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Check server status |
| POST | `/observations/batches` | Submit sanitized activity events |
| GET | `/work-sessions/current` | Get the current work session |
| POST | `/goals/infer` | Infer goal candidates |
| POST | `/goals/confirm` | Confirm or correct a goal |
| GET | `/goals/current` | Get the current goal |
| PATCH | `/goals/:goalId` | Update a goal |
| POST | `/goals/:goalId/complete` | Complete a goal |
| POST | `/checkpoints` | Create a checkpoint |
| GET | `/checkpoints/latest` | Get the latest checkpoint |
| POST | `/gaps` | Start a gap session |
| GET | `/gaps/:gapId` | Get gap status |
| GET | `/gaps/:gapId/events` | Stream status through SSE |
| POST | `/gaps/:gapId/end` | End a gap session |
| GET | `/gaps/:gapId/actions` | List planned actions |
| POST | `/actions/:actionId/approve` | Approve an action |
| POST | `/actions/:actionId/reject` | Reject an action |
| POST | `/actions/:actionId/rollback` | Roll back a reversible action |
| POST | `/gaps/:gapId/recovery-brief` | Regenerate a recovery brief |
| GET | `/gaps/:gapId/recovery-brief` | Get a recovery brief |
| GET | `/permission-profile` | Get permission settings |
| PUT | `/permission-profile` | Update permission settings |

## 10.3 Core Request and Response Examples

### Submit Activity Events

```http
POST /api/v1/observations/batches
```

```json
{
  "deviceId": "dev_01J9X",
  "events": [
    {
      "eventId": "evt_01J9Y",
      "type": "ACTIVE_WINDOW_CHANGED",
      "occurredAt": "2026-08-01T05:10:00.000Z",
      "application": {
        "name": "Microsoft Word",
        "category": "DOCUMENT"
      },
      "resource": {
        "title": "Final Project Report.docx",
        "kind": "DOCUMENT"
      },
      "metadata": {
        "idleSeconds": 0
      }
    }
  ]
}
```

```json
{
  "accepted": 1,
  "rejected": 0,
  "workSessionId": "ws_01JA0",
  "shouldInferGoal": true
}
```

### Infer Goals

```http
POST /api/v1/goals/infer
```

```json
{
  "workSessionId": "ws_01JA0",
  "previousGoalId": null,
  "forceRefresh": false
}
```

```json
{
  "inferenceId": "inf_01JA1",
  "candidates": [
    {
      "candidateId": "candidate_1",
      "title": "Write the final project report",
      "description": "Research QR factorization stability and incorporate it into the report",
      "confidence": 0.84,
      "evidence": [
        {
          "type": "RESOURCE",
          "description": "The final project report document was edited"
        },
        {
          "type": "ACTIVITY_SEQUENCE",
          "description": "The user returned to the report after reading QR factorization material"
        }
      ],
      "suggestedGoalPath": [
        "Complete the final project",
        "Write the report",
        "Write the QR factorization section"
      ]
    }
  ],
  "requiresConfirmation": true,
  "inferenceSummary": "Report writing is the most likely current goal."
}
```

### Confirm a Goal

```http
POST /api/v1/goals/confirm
```

```json
{
  "workSessionId": "ws_01JA0",
  "inferenceId": "inf_01JA1",
  "candidateId": "candidate_1",
  "userCorrection": null
}
```

### Create a Checkpoint

```http
POST /api/v1/checkpoints
```

```json
{
  "workSessionId": "ws_01JA0",
  "goalId": "goal_01JA2",
  "trigger": "BEFORE_GAP"
}
```

### Start a Gap Session

```http
POST /api/v1/gaps
```

```json
{
  "workSessionId": "ws_01JA0",
  "detection": {
    "type": "MANUAL",
    "confidence": 1,
    "signals": []
  },
  "requestedMode": "CONTINUITY"
}
```

```json
{
  "gapId": "gap_01JA4",
  "status": "PLANNING",
  "goalId": "goal_01JA2",
  "checkpointId": "cp_01JA3",
  "eventStreamUrl": "/api/v1/gaps/gap_01JA4/events"
}
```

### Approve an Action

```http
POST /api/v1/actions/:actionId/approve
```

```json
{
  "approvalScope": "THIS_ACTION"
}
```

The MVP only supports `THIS_ACTION` approval scope.

### Get Recovery Brief

```http
GET /api/v1/gaps/:gapId/recovery-brief
```

The response follows the shared `RecoveryBrief` contract. `externalEffects` must always be included, even when it is an empty array.

## 10.4 SSE Events

```text
event: agent.status
data: {"status":"planning"}

event: action.planned
data: {"actionId":"act_01","title":"Organize references"}

event: action.completed
data: {"actionId":"act_01"}

event: approval.required
data: {"actionId":"act_02"}

event: recovery.ready
data: {"gapId":"gap_01"}
```

---

# 11. Agent Design

## 11.1 MVP Agent Configuration

The MVP uses only two agents.

### Goal Interpreter

Responsibilities:

- Interpret an activity session as a meaningful task
- Generate up to three goal candidates
- Return evidence and confidence for each candidate
- Suggest a hierarchical goal path
- Detect a likely goal switch

The Goal Interpreter does not call external tools.

### Continuity Agent

Responsibilities:

- Create a continuity objective during a gap
- Define success criteria and constraints
- Generate an action plan from the current goal
- Call allowed tools
- Evaluate tool results
- Recommend the next action after recovery

## 11.2 Goal Interpreter Output Schema

```typescript
const GoalInferenceResultSchema = z.object({
  candidates: z.array(
    z.object({
      title: z.string().min(1),
      description: z.string(),
      confidence: z.number().min(0).max(1),
      evidence: z.array(
        z.object({
          type: z.enum([
            "RESOURCE",
            "ACTIVITY_SEQUENCE",
            "CALENDAR",
            "PREVIOUS_GOAL",
            "USER_PATTERN",
          ]),
          description: z.string(),
        }),
      ),
      suggestedGoalPath: z.array(z.string()).min(1),
    }),
  ).min(1).max(3),
  requiresConfirmation: z.boolean(),
  inferenceSummary: z.string(),
});
```

## 11.3 Example Continuity Objective

```json
{
  "objective": {
    "title": "Preserve the report-writing workflow",
    "successCriteria": [
      "Do not lose the current task state",
      "Make the next action immediately understandable after recovery",
      "Complete approved preparation tasks"
    ],
    "constraints": [
      "Do not change the report's claims or conclusion",
      "Do not automatically send external messages",
      "Do not overwrite the original file"
    ]
  }
}
```

## 11.4 Agent Loop

```text
Observe Context
  ↓
Infer or Load Goal
  ↓
Create Continuity Objective
  ↓
Generate Action Candidates
  ↓
Policy Check
  ↓
Execute Allowed Tool
  ↓
Observe Result
  ↓
Update Plan
  ↓
Produce Recovery Brief
```

## 11.5 Prompt Rules

- Never infer or diagnose a medical condition.
- Clearly separate observed facts from model inference.
- Assign low confidence when evidence is insufficient.
- Do not automatically execute actions requiring core user judgment.
- Never claim that a tool was used if no such tool exists or the call failed.
- Prefer drafts and copies over direct modification of originals.
- Explain how each proposed action supports the current goal.

---

# 12. Tool Design

## 12.1 MVP Tools

| Tool | Description | Default Policy |
|---|---|---|
| `create_checkpoint` | Save current work, unfinished thoughts, and next actions | Auto |
| `create_todo_draft` | Create an internal TODO draft | Auto |
| `create_message_draft` | Create a message draft | Auto |
| `organize_references` | Create a virtual reference collection without moving originals | Auto |
| `generate_recovery_brief` | Generate the recovery brief | Auto |

## 12.2 Tool Design Rules

Bad:

```typescript
doEverythingForUser();
```

Good:

```typescript
createCheckpoint();
createTodoDraft();
createMessageDraft();
generateRecoveryBrief();
```

Every tool returns a structured result.

```typescript
interface ToolResult {
  status: "SUCCESS" | "FAILED";
  effect?: {
    type: string;
    resourceId: string;
  };
  reversible: boolean;
  rollbackToken?: string;
  error?: {
    code: string;
    message: string;
  };
}
```

## 12.3 Provider Adapters

The agent must not depend directly on Gmail, Google Calendar, or any other provider.

```typescript
export interface CalendarProvider {
  getUpcomingEvents(input: {
    from: Date;
    to: Date;
  }): Promise<CalendarEventSummary[]>;
}

export interface MessageProvider {
  createDraft(input: MessageDraftInput): Promise<MessageDraft>;
}
```

MVP implementations:

```text
CalendarProvider
├─ MockCalendarProvider
└─ GoogleCalendarProvider (optional)

MessageProvider
├─ LocalMessageDraftProvider
└─ GmailDraftProvider (optional)
```

---

# 13. Policy Engine

## 13.1 Policy Decisions

```typescript
export type PolicyDecision =
  | "AUTO_EXECUTE"
  | "REQUIRE_APPROVAL"
  | "DOWNGRADE"
  | "DENY";
```

## 13.2 Default Policy by Risk Level

| Level | Examples | Default Handling |
|---|---|---|
| Low | Summary, checkpoint, TODO, draft | Auto-execute |
| Medium | Email draft, temporary calendar block, draft PR | Depends on settings |
| High | Send email, finalize calendar changes, edit original document | Require approval after recovery |
| Prohibited | Payment, contract, deletion, medical judgment | Deny |

## 13.3 Downgrade Example

```json
{
  "requestedAction": "SEND_EMAIL",
  "decision": "DOWNGRADE",
  "allowedAction": "CREATE_EMAIL_DRAFT",
  "reason": "Automatic email sending is not permitted."
}
```

## 13.4 Permission Profile

```json
{
  "rules": {
    "CREATE_CHECKPOINT": "AUTO",
    "CREATE_TODO_DRAFT": "AUTO",
    "ORGANIZE_REFERENCES": "AUTO",
    "CREATE_MESSAGE_DRAFT": "AUTO",
    "CREATE_EMAIL_DRAFT": "ASK",
    "SEND_EMAIL": "NEVER",
    "CREATE_CALENDAR_DRAFT": "AUTO",
    "UPDATE_CALENDAR_EVENT": "ASK",
    "EDIT_ORIGINAL_DOCUMENT": "NEVER",
    "DELETE_RESOURCE": "NEVER",
    "MAKE_PAYMENT": "NEVER"
  }
}
```

```typescript
export type PermissionDecision = "AUTO" | "ASK" | "NEVER";
```

---

# 14. Privacy and Security

## 14.1 Local-First Principle

Stored locally only:

- Raw activity events
- Full window-switch history
- Blocked application list
- Raw idle-time data
- Unredacted window titles

May be sent to the backend after sanitization:

- Application name
- Redacted window title
- Resource type
- Activity time range
- Minimal summary required for goal inference

## 14.2 Data Not Collected

- Password input
- Raw keystrokes
- Full-screen video
- Incognito browsing activity
- Content from blocked applications
- Government identifiers or other high-risk identifiers
- Full document bodies by default

## 14.3 Local Privacy Filter

Before data is sent to the backend or OpenAI:

- Mask email addresses
- Mask phone numbers
- Mask long numeric identifiers
- Exclude password fields
- Exclude blocked applications
- Prefer titles and summaries over full document content

## 14.4 OpenAI Data Handling Rules

- Store API keys only in the backend environment
- Never bundle API keys in the desktop binary
- Send the minimum necessary context
- Use `store: false` by default for Responses API requests
- Do not include sensitive raw content in traces
- Keep goals and checkpoints in the project database as the primary source of truth

## 14.5 Audit Logs

```typescript
interface AuditLog {
  auditLogId: string;
  gapId: string;
  actionId?: string;
  actor: "USER" | "AGENT" | "POLICY_ENGINE" | "SYSTEM";
  eventType: string;
  reason?: string;
  occurredAt: string;
}
```

---

# 15. Gap Detection

## 15.1 State Machine

```text
ACTIVE
  ↓ inactivity or user action
POSSIBLE_GAP
  ↓ manual start or additional conditions
GAP_CONFIRMED
  ↓ user activity resumes
RECOVERING
  ↓ recovery brief acknowledged
ACTIVE
```

## 15.2 MVP Detection Methods

Primary method:

- The user presses `Start Gap`

Optional method:

- 20 minutes of inactivity
- No active-window change
- No response to a confirmation prompt

Automatic detection is only enabled when the user explicitly turns it on.

## 15.3 Wording Rules

Do not say:

> “Narcolepsy was detected.”

Use:

> “Task activity has been interrupted for an extended period.”

> “Would you like to start Gap Mode?”

---

# 16. Database Design

## 16.1 MVP Tables

```text
users
permission_profiles
work_sessions
activity_events
goals
checkpoints
gap_sessions
action_executions
recovery_briefs
audit_logs
```

If authentication is excluded from the MVP, seed a single demo user.

## 16.2 Core Relationships

```text
User
├─ PermissionProfile
├─ WorkSession[]
│  ├─ ActivityEvent[]
│  ├─ Goal[]
│  └─ Checkpoint[]
└─ GapSession[]
   ├─ PlannedAction[]
   │  └─ ActionExecution
   ├─ RecoveryBrief
   └─ AuditLog[]
```

## 16.3 Data Retention Split

- Raw activity events: local SQLite
- Sanitized observation summaries: PostgreSQL
- Goals, checkpoints, action results: PostgreSQL
- Demo data: seeded fixtures

---

# 17. Four-Person Team Allocation

## 17.1 Role Summary

| Member | Role | Core Responsibility |
|---|---|---|
| Member 1 | Native & Privacy Engineer | Activity observation and local privacy processing |
| Member 2 | Product & Frontend Engineer | End-to-end user experience and UI |
| Member 3 | Backend & Data Engineer | REST, SSE, database, shared contracts |
| Member 4 | Agent Engineer / Tech Lead | Goal Interpreter, Continuity Agent, tools, policy |

## 17.2 Member 1 — Native & Privacy

Owned area:

```text
apps/desktop/src-tauri/**
```

Responsibilities:

- Detect active windows on Windows
- Measure idle time
- Generate ActivityEvent objects
- Implement Tauri commands
- Manage local SQLite storage
- Implement blocked-app and privacy filters
- Provide the Observation API integration interface
- Create and configure the native Quick Overlay Tauri window
- Configure always-on-top, frameless behavior, size, and bottom-right positioning
- Implement native commands for showing, hiding, and positioning the overlay
- Own all changes to Tauri window configuration and capabilities

Definition of done:

- The current application and window title are displayed in real time.
- No events are created for blocked applications.
- A sanitized ActivityEvent array is produced.
- A mock event generator can replace the native observer.
- The Quick Overlay can be shown and hidden through Tauri commands.
- The overlay appears above other applications without replacing the Main Window.
- The overlay can load the React overlay entry point using mock data.

## 17.3 Member 2 — Product & Frontend

Owned area:

```text
apps/desktop/src/**
```

Required screens:

- Dashboard
- Goal candidate selection
- Current goal and progress stage
- Gap start and end controls
- Agent progress view
- Action approval and rejection
- Recovery brief
- Permission settings
- Quick Overlay
  - Goal confirmation
  - Gap start confirmation
  - Action approval and rejection
  - Recovery notification

Definition of done:

- The full demo flow works with mock JSON only.
- API access is isolated in `features/*/api.ts`.
- Loading, error, and empty states are handled.
- SSE events update the UI correctly.
- The complete Quick Overlay flow works with mock JSON.
- The overlay supports goal confirmation, gap start confirmation, approval, and recovery notification states.
- The overlay can open the corresponding detailed screen in the Main Window.
- The overlay UI can be tested independently before native Tauri window integration.

Quick Overlay rules:

- The Quick Overlay is a separate lightweight Tauri window.
- Member 2 owns only the React UI, UI state, and user interactions rendered inside the overlay.
- Overlay components must reuse the existing feature APIs, shared contracts, Zustand stores, and design tokens.
- Business logic must not be duplicated between the Main Window and the Quick Overlay.
- Detailed views remain available in the Main Window.

## 17.4 Member 3 — Backend & Data

Owned area:

```text
apps/api/src/features/**
apps/api/src/plugins/**
packages/contracts/**
packages/db/**
```

Responsibilities:

- Fastify server
- REST API
- SSE publisher
- Zod request and response validation
- Drizzle schema and migrations
- Repository and service layers
- Final ownership of shared contracts
- Mock agent services
- Error and idempotency handling

Definition of done:

- All MVP endpoints work using mock agent services.
- State is persisted in the database.
- SSE events reach the desktop client.
- Agent implementations can be swapped through interfaces.

## 17.5 Member 4 — Agent & Integration

Owned area:

```text
apps/api/src/agents/**
apps/api/src/tools/**
apps/api/src/policy/**
```

Responsibilities:

- Goal Interpreter
- Continuity Agent
- Structured output schemas
- Tool calling
- Tool registry
- Policy Engine
- Guardrails
- Agent tracing and fixture tests
- Final agent/backend integration

Definition of done:

- Stable goal candidate JSON is produced from fixtures.
- A continuity objective and action plan are generated during a gap.
- At least three tools are actually called.
- Risky actions are approved, downgraded, or denied by policy.
- Tool failures are represented honestly in the recovery brief.

---

# 18. Parallel Development Without Conflicts

## 18.1 Prerequisites for Parallel Work

All four members can work simultaneously after the following are frozen:

1. Shared types in `packages/contracts`
2. Mock JSON fixtures
3. API endpoint and request/response contracts

## 18.2 Modification Boundaries

| Member | Primary Area | Should Not Directly Modify |
|---|---|---|
| 1 | `apps/desktop/src-tauri/**` | React, API agent internals |
| 2 | `apps/desktop/src/**` | Rust, database, agent internals |
| 3 | `features/**`, `contracts/**`, `db/**` | Frontend and agent internals |
| 4 | `agents/**`, `tools/**`, `policy/**` | Database schema and HTTP routes |

## 18.3 Mock-Based Independent Development

### Member 1

Generate ActivityEvent arrays locally and save them as JSON without waiting for the backend.

### Member 2

Use:

```text
apps/desktop/src/mocks/
├─ goal-candidates.json
├─ gap-session.json
├─ action-plan.json
└─ recovery-brief.json
```

### Member 3

Use a mock AI implementation:

```typescript
export interface GoalInferenceService {
  infer(context: WorkContext): Promise<GoalInferenceResult>;
}

export class MockGoalInferenceService
  implements GoalInferenceService {
  async infer(): Promise<GoalInferenceResult> {
    return goalInferenceFixture;
  }
}
```

### Member 4

Develop the agents with fixture context:

```typescript
const contextFixture = {
  applications: ["Microsoft Word", "Google Chrome"],
  resources: [
    "Final Project Report.docx",
    "QR Factorization Stability",
  ],
  recentActions: [
    "Edited the report",
    "Searched for QR factorization",
    "Returned to the report",
  ],
};
```

## 18.4 Shared Service Interfaces

```typescript
export interface ObservationSource {
  getRecentEvents(): Promise<ActivityEvent[]>;
}

export interface GoalInferenceService {
  infer(context: WorkContext): Promise<GoalInferenceResult>;
}

export interface ContinuityService {
  plan(context: GapContext): Promise<ActionPlan>;
}

export interface EventPublisher {
  publish(event: AgentEvent): Promise<void>;
}

export interface ToolExecutor {
  execute(action: PlannedAction): Promise<ActionResult>;
}
```

Integration is performed by replacing mock implementations with real implementations.

---

# 19. Git Strategy

## 19.1 Branches

```text
main
├─ chore/bootstrap
├─ feat/desktop-observer
├─ feat/frontend-flow
├─ feat/backend-api
└─ feat/agent-engine
```

Use a dedicated branch for major contract changes:

```text
chore/contracts-v2
```

## 19.2 Rules

- No direct pushes to `main`
- Every change goes through a pull request
- Shared files have one final owner
- One feature per PR
- Contract changes merge before dependent feature PRs
- New dependencies are added in small, isolated commits
- Only Member 3 creates database migrations
- Only Member 4 makes final changes to the Tool Registry

## 19.3 Recommended Commit Messages

```text
feat(observer): detect active window
feat(goal): add goal inference schema
feat(agent): implement continuity planning
feat(ui): add recovery brief screen
fix(policy): downgrade email send to draft
chore(contract): update planned action schema
```

## 19.4 CODEOWNERS

```text
/apps/desktop/src-tauri/       @member1
/apps/desktop/src/             @member2
/apps/api/src/features/        @member3
/packages/db/                  @member3
/packages/contracts/           @member3
/apps/api/src/agents/          @member4
/apps/api/src/tools/           @member4
/apps/api/src/policy/          @member4
```

Replace placeholders with the actual GitHub usernames.

---

# 20. Implementation Order

## Phase 0 — Bootstrap

Owner: all members, final owner Member 3

- Create the monorepo
- Configure workspaces
- Add shared TypeScript configuration
- Add `.env.example`
- Create initial contracts
- Create mock JSON fixtures
- Freeze endpoint definitions
- Freeze the demo scenario

Completion criteria:

- Every member can run their assigned app or package.
- The team agrees on the shared contracts.

## Phase 1 — Independent Parallel Development

### Member 1

```text
Windows Observer
→ Privacy Filter
→ ActivityEvent
```

### Member 2

```text
Mock Goal
→ Gap UI
→ Action Progress
→ Recovery UI
```

### Member 3

```text
Fastify
→ PostgreSQL
→ REST
→ SSE
→ Mock Agent
```

### Member 4

```text
Fixture
→ Goal Interpreter
→ Continuity Agent
→ Tool Calls
→ Policy Engine
```

## Phase 2 — First Integration

```text
Observer
→ Observation API
→ Work Context
→ Goal Interpreter
→ Goal API
→ Goal UI
```

## Phase 3 — Second Integration

```text
Gap UI
→ Gap API
→ Continuity Agent
→ Policy Engine
→ Tool Executor
→ SSE
→ Action UI
```

## Phase 4 — Recovery Integration

```text
Gap End
→ Action Results
→ Recovery Brief
→ Recovery UI
```

## Phase 5 — Demo Stabilization

- Freeze the feature set
- Lock demo seed data
- Handle network failure
- Add fixture fallback for OpenAI failure
- Verify retries and idempotency
- Add a presentation-friendly log mode
- Repeat the full E2E flow multiple times

---

# 21. Testing Strategy

## 21.1 Unit Tests

### Rust

- Active-window parser
- Blocked-app filter
- Sensitive-data redactor
- ActivityEvent conversion

### Backend

- Zod schemas
- Policy Engine
- Risk Classifier
- Goal Service
- Gap state transitions

### Agent

- Structured output validation
- One to three goal candidates only
- No unsupported high-confidence inference
- Prohibited tools are never called
- Send-email requests are downgraded

## 21.2 Integration Tests

- Observation → WorkSession
- Goal API → Agent Service
- Gap Start → Action Plan
- Approval → Tool Execution
- Gap End → Recovery Brief
- SSE ordering and reconnection

## 21.3 End-to-End Test

```text
Submit mock activity
→ Display goal candidates
→ Confirm a goal
→ Start a gap
→ Display action plan
→ Approve an action
→ End the gap
→ Display recovery brief
```

## 21.4 Failure Scenarios

- OpenAI request failure
- Structured output validation failure
- Tool execution failure
- Duplicate approval request
- SSE disconnection
- Database write failure
- Immediate user return after gap start
- Gap start without a confirmed goal

---

# 22. Environment Variables

```env
# Server
NODE_ENV=development
API_PORT=4000
API_HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/continuity

# OpenAI
OPENAI_API_KEY=
OPENAI_GOAL_MODEL=gpt-5-mini
OPENAI_CONTINUITY_MODEL=gpt-5.1
OPENAI_RECOVERY_MODEL=gpt-5-mini
OPENAI_STORE_RESPONSES=false
OPENAI_TRACE_INCLUDE_SENSITIVE_DATA=false

# Desktop
VITE_API_BASE_URL=http://localhost:4000/api/v1
VITE_USE_MOCKS=true

# Demo
DEMO_USER_ID=usr_demo
DEMO_DEVICE_ID=dev_demo
DEMO_FIXTURE_MODE=true
```

Never commit `.env` files.

---

# 23. Suggested Development Scripts

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "dev:desktop": "pnpm --filter @continuity/desktop tauri dev",
    "dev:api": "pnpm --filter @continuity/api dev",
    "db:generate": "pnpm --filter @continuity/db generate",
    "db:migrate": "pnpm --filter @continuity/db migrate",
    "db:seed": "pnpm --filter @continuity/db seed"
  }
}
```

---

# 24. UI Screen Definitions

## 24.1 Dashboard

Display:

- Current active application
- Current inferred goal
- Current goal path
- Confidence and evidence
- Start Gap button
- Pause Observation button

## 24.2 Goal Confirmation

```text
We inferred what you are currently working on.

1. Write the final project report — 84%
   You appear to be researching QR factorization and incorporating it into the report.

2. Study QR factorization — 12%

[Select 1] [Select 2] [Enter a different goal]
```

## 24.3 Gap Status

```text
Gap Mode is active.

Current Goal
Final Project → Report Writing → QR Factorization Section

Agent Status
• Continuity objective created
• Organizing references
• Message draft waiting for approval
```

## 24.4 Approval Dialog

Always show:

- Requested action
- Why the action was proposed
- Data used
- External impact
- Whether it is reversible

## 24.5 Recovery Brief

```text
Your task flow was interrupted for 38 minutes.

Goal Before the Gap
Final Project → Report Writing → QR Factorization Section

Completed Actions
✓ Organized 3 references
✓ Created an outline for the next paragraph
✓ Summarized 4 team messages

External Effects
None

Recommended Next Step
Review the QR stability outline — about 10 minutes
```

## 24.6 Quick Overlay

The Quick Overlay is a separate lightweight Tauri window for short, time-sensitive interactions while the user is working in another application.

It is part of the MVP and is not optional.

### Overlay Principles

- The overlay does not replace the Main Window.
- The overlay must show only one interaction at a time.
- Detailed information must remain in the Main Window.
- The overlay must not contain independent business logic.
- It must reuse the same feature APIs, Zustand state, shared contracts, and design tokens as the Main Window.
- Closing or dismissing the overlay must not lose the current goal, gap session, action, or recovery state.
- The user must always be able to open the relevant detailed Main Window screen.

### Overlay States

The MVP supports exactly four overlay states:

1. `GOAL_CONFIRMATION`
2. `GAP_START_CONFIRMATION`
3. `APPROVAL_REQUIRED`
4. `RECOVERY_READY`

### Goal Confirmation Overlay

Show:

- Up to three inferred goal candidates
- Confidence for each candidate
- A short evidence summary
- Select action
- Enter a different goal action
- Open details in the Main Window

### Gap Start Confirmation Overlay

Show:

- Confirmed current goal
- Latest checkpoint summary
- Start Gap action
- Cancel action

### Approval Overlay

Show:

- Requested action
- Reason
- External impact
- Reversibility
- Approve action
- Reject action
- Open full details in the Main Window

### Recovery Notification Overlay

Show:

- Gap duration
- Previous goal
- Number of completed actions
- Whether any external effect occurred
- Recommended next action
- Resume action
- Open Full Recovery Brief action

### Display Rules

- Goal confirmation appears only when the Goal Interpreter requires user confirmation.
- Gap start confirmation appears only after a manual Gap Start request or an enabled inactivity suggestion.
- Approval appears only for an action in `WAITING_APPROVAL`.
- Recovery notification appears when the `recovery.ready` event is received.
- Only one overlay state may be visible at a time.
- Overlay priority is:

```text
APPROVAL_REQUIRED
→ RECOVERY_READY
→ GAP_START_CONFIRMATION
→ GOAL_CONFIRMATION
```

---

# 25. Success Metrics

## 25.1 Hackathon Success Criteria

- The complete demo works without manual database edits
- Goal candidates are returned as structured JSON
- The agent selects an appropriate tool from at least three available tools
- The Policy Engine blocks or downgrades a risky action
- The recovery brief lists every external effect
- Code developed in parallel integrates through shared contracts

## 25.2 Product Metrics

- Time from return to first meaningful action
- Goal candidate selection accuracy
- Rate of manual goal corrections
- Rate of approval rejection or rollback
- User-rated usefulness of the recovery brief
- Goal continuity rate before and after a gap

---

# 26. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Incorrect goal inference | Wrong continuity plan | Show up to 3 candidates and require confirmation |
| Excessive data collection | Loss of trust | Local filtering, blocked apps, minimal transmission |
| Over-autonomous behavior | External harm | Policy Engine, approvals, downgrades |
| OpenAI latency | Demo failure | Fixture fallback and timeout |
| Contract mismatch | Integration failure | Single contract owner |
| Lockfile conflicts | Build failure | Member 3 owns dependency changes |
| Native observer instability | No input data | Demo event generator |
| SSE disconnection | Missing progress updates | Polling fallback |
| Excessive scope | Incomplete MVP | Limit to 2 agents and 5 tools |

---

# 27. Final Checklist

## Shared

- [ ] Monorepo runs successfully
- [ ] Shared contracts are frozen
- [ ] Mock JSON is finalized
- [ ] Demo seed is finalized
- [ ] `.env.example` is complete

## Desktop Native

- [ ] Active-window detection
- [ ] Idle-time detection
- [ ] Blocked-app filter
- [ ] ActivityEvent generation
- [ ] Mock observer fallback
- [ ] Quick Overlay native window
- [ ] Always-on-top behavior
- [ ] Overlay show and hide commands
- [ ] Bottom-right window positioning
- [ ] Main Window fallback when overlay fails

## Frontend

- [ ] Dashboard
- [ ] Goal confirmation
- [ ] Gap status
- [ ] Approval dialog
- [ ] Recovery brief
- [ ] SSE integration
- [ ] Goal confirmation overlay
- [ ] Gap start confirmation overlay
- [ ] Approval overlay
- [ ] Recovery notification overlay
- [ ] Overlay state priority handling
- [ ] Open detailed Main Window screen from overlay
- [ ] Shared API, state, and design-token reuse

## Backend

- [ ] REST endpoints
- [ ] PostgreSQL schema
- [ ] SSE publisher
- [ ] Mock agent service
- [ ] Error handler
- [ ] Audit log

## Agent

- [ ] Goal Interpreter
- [ ] Continuity Agent
- [ ] Structured outputs
- [ ] Five MVP tools
- [ ] Policy Engine
- [ ] Tool-failure handling

## Demo

- [ ] Presentation activity scenario
- [ ] OpenAI failure fallback
- [ ] External-effects disclosure
- [ ] Risky-action blocking demonstration
- [ ] Full flow succeeds at least three times in a row

---

# 28. Official Technical References

Use the official documentation for:

- OpenAI Agents SDK for TypeScript
  - Agent loop
  - Function tools with Zod validation
  - Human-in-the-loop approvals
  - Sessions
  - Tracing
- OpenAI Responses API
  - Function calling
  - Structured Outputs with JSON Schema
  - Response storage controls
- Tauri 2
  - React/Vite desktop frontend
  - Rust commands and capabilities
- Fastify
  - TypeScript server and plugin architecture
- Zod v4
  - Runtime validation for APIs and agent outputs

Reconfirm library versions and model availability immediately before the hackathon.

---

# 29. Final Summary

```text
Member 1 safely observes user activity.
Member 2 gives the user visibility and control.
Member 3 connects data, APIs, and shared contracts.
Member 4 infers goals and plans policy-approved actions.
```

The four members do not edit the same code at the same time. They build separate implementations in parallel against stable shared contracts.

```text
ActivityEvent
  ↓
WorkContext
  ↓
GoalInferenceResult
  ↓
Confirmed Goal
  ↓
Checkpoint
  ↓
GapSession
  ↓
ActionPlan
  ↓
Policy Decision
  ↓
ActionResult
  ↓
RecoveryBrief
```

The project’s key differentiator is summarized in one sentence:

> **Most AI systems perform tasks when the user asks. This agent protects the user’s goals when the user temporarily disappears.**
