# Consciousness Gap Agent

> 사용자의 의식과 작업 흐름이 잠시 끊기더라도, 사용자의 목표와 사회적 연속성을 안전하게 보존하고 위임된 범위에서 목표를 계속 진전시키는 자율형 AI 에이전트

- 문서 상태: Hackathon MVP 기준 확정안
- 작성일: 2026-08-01
- 대상 트랙: Track 02 — Social Impact
- 팀 규모: 4명
- 프로젝트 가칭: `continuity-agent`

---

## 0. 문서 목적

이 문서는 프로젝트의 다음 항목을 하나의 기준으로 통합한다.

1. 문제 정의와 제품 컨셉
2. MVP 범위와 데모 시나리오
3. 전체 파이프라인 아키텍처
4. 기술 스택
5. 모노레포 파일 구조
6. 내부 REST/SSE API
7. OpenAI Agent 및 Tool 구조
8. 권한·안전·개인정보 정책
9. 데이터 모델과 공통 계약
10. 4인 팀 분업
11. 동시 개발 시 충돌 방지 규칙
12. 구현 순서와 완료 기준

이 문서를 변경할 때는 코드보다 먼저 공통 계약과 API 변경 여부를 검토한다.

---

# 1. 프로젝트 개요

## 1.1 한 줄 정의

**Consciousness Gap Agent는 사용자의 현재 목표를 지속적으로 추론하고, 작업 연속성이 끊기면 위임된 권한 안에서 목표를 계속 진전시키며, 사용자가 돌아왔을 때 사고 흐름과 사회적 맥락을 복구하는 자율형 AI 에이전트다.**

## 1.2 문제 정의

기면증, 갑작스러운 수면, 실신, 약물 부작용, 극심한 피로, 응급상황 등으로 사용자가 잠시 활동할 수 없게 되면 단순히 시간이 사라지는 것이 아니다.

사용자는 다음을 잃는다.

- 지금 이루려던 목표
- 작업의 현재 단계
- 왜 이 자료를 보고 있었는지에 대한 의도
- 미완성된 사고 흐름
- 공백 중 발생한 메시지와 일정 변화
- 팀원, 교수, 직장 동료 등과의 사회적 연속성

기존 도구는 파일, 탭, 회의록은 저장하지만 다음 질문에 충분히 답하지 못한다.

> “내가 무엇을 하려고 했고, 지금 무엇부터 이어서 해야 하지?”

## 1.3 핵심 가치

```text
파일을 저장한다                 → 기존 소프트웨어
활동을 요약한다                 → 일반 AI 비서
사용자의 목표를 이해한다        → Goal Interpreter
공백 중 목표를 안전하게 지킨다   → Continuity Agent
복귀 시 사고 흐름을 이어준다      → Consciousness Gap Agent
```

## 1.4 사회적 임팩트

첫 번째 핵심 사용자는 기면증 환자다. 이후 다음 사용자군으로 확장할 수 있다.

- 과도한 주간 졸림이나 수면장애가 있는 사람
- 갑작스러운 발작 또는 실신 가능성이 있는 사람
- 치료나 약물로 인해 각성이 불안정한 사람
- 만성질환과 피로로 작업이 자주 끊기는 사람
- ADHD, 인지 피로 등으로 맥락 복구에 어려움이 있는 사람

이 서비스는 질병을 진단하거나 치료하지 않는다. **사용자의 일상 자립과 작업 연속성을 보조하는 생산성·접근성 에이전트**로 정의한다.

---

# 2. 제품 원칙

## 2.1 핵심 원칙

1. AI는 사용자의 의도를 단정하지 않고 후보와 근거를 제시한다.
2. AI는 작업을 대신 결정하기보다, 결정된 목표를 대신 진전시킨다.
3. 모든 행동은 권한 정책을 통과한다.
4. 외부 영향이 있는 행동은 기본적으로 사용자 승인을 받는다.
5. 원시 활동 데이터는 로컬 우선으로 처리한다.
6. 공백 감지는 의료 진단이 아니라 작업 연속성 중단 가능성 감지다.
7. 복귀 시 AI가 무엇을 했는지 투명하게 보여준다.
8. 자동화 범위보다 신뢰성과 복구 가능성을 우선한다.

## 2.2 제품이 하지 않는 것

- 기면증 또는 다른 질환 진단
- 의식 상태의 의학적 판정
- 의료 조치 추천 또는 약물 조언
- 사용자 대신 계약, 결제, 법적 동의 수행
- 중요한 외부 메시지의 무승인 발송
- 원본 파일의 파괴적 변경
- 비밀번호, 원시 키 입력, 전체 화면 상시 수집

---

# 3. MVP 범위

## 3.1 MVP 핵심 흐름

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

## 3.2 MVP에서 구현할 기능

### 관찰

- Windows 활성 애플리케이션 감지
- 활성 창 제목 감지
- 사용자 유휴 시간 측정
- 차단 앱 및 민감 창 제외
- 정제된 활동 이벤트 생성

### 목표 추론

- 현재 목표 후보 최대 3개 생성
- 후보별 신뢰도와 근거 표시
- 사용자가 후보 선택 또는 직접 수정
- 선택된 목표를 계층 구조로 저장

### 체크포인트

- 현재 목표
- 현재 진행 단계
- 완료한 내용
- 미해결 질문
- 다음 예상 행동
- 관련 자료

### 공백 모드

- 사용자가 직접 공백 모드 시작
- 선택적으로 일정 시간 무활동 후 공백 후보 제안
- 공백 시작 시 최신 체크포인트 보존

### 공백 중 행동

- 체크포인트 생성
- TODO 초안 생성
- 메시지 초안 생성
- 참고자료 가상 정리
- 복귀 브리핑 생성

### 복귀

- 공백 전 목표
- 공백 중 변화
- AI가 수행한 행동
- 승인 대기 행동
- 외부에 전송된 내용
- 다음 추천 행동 하나

## 3.3 MVP에서 제외할 기능

- 카메라 기반 졸음 감지
- 웨어러블 생체 신호 연동
- 의료기관 연동
- 자동 이메일 발송
- 결제 또는 계약
- 여러 운영체제 완전 지원
- 전체 브라우저 기록 수집
- 완전한 자율 컴퓨터 조작
- 다섯 개 이상의 멀티 에이전트 구성

---

# 4. 데모 시나리오

## 4.1 대표 데모

1. 사용자가 Word에서 보고서를 작성한다.
2. Chrome에서 보고서와 관련된 자료를 검색한다.
3. 시스템이 다음 목표 후보를 제시한다.
   - 기말 프로젝트 보고서 작성
   - QR 분해 개념 공부
   - 발표 자료 준비
4. 사용자가 `기말 프로젝트 보고서 작성`을 선택한다.
5. AI가 현재 단계를 `QR 분해 안정성 설명 작성`으로 체크포인트에 저장한다.
6. 사용자가 `공백 시작` 버튼을 누른다.
7. Continuity Agent가 임시 목표를 생성한다.
   - “보고서 작성 흐름을 보존하고 복귀 비용을 최소화한다.”
8. 정책상 허용된 도구를 실행한다.
   - 관련 참고자료 정리
   - 다음 문단 개요 작성
   - 새 팀 메시지 요약
   - 답장 초안 생성
9. 사용자가 복귀한다.
10. 복귀 화면에서 다음을 확인한다.
   - 공백 전 목표
   - 완료된 준비 작업
   - 외부 전송 없음
   - 다음 행동: “QR 분해 안정성 개요 검토”

## 4.2 심사위원에게 보여줄 핵심

- AI가 사용자의 명령을 기다리지 않고 목표를 추론한다.
- 공백이 시작되면 상황에 맞는 임시 목표를 스스로 만든다.
- 목표로부터 행동 계획을 생성한다.
- 도구를 호출해 실제 결과물을 만든다.
- 정책 엔진이 위험 행동을 제한한다.
- 사용자가 복귀했을 때 행동의 이유와 결과가 투명하게 보인다.

---

# 5. 전체 아키텍처

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

## 5.1 책임 분리

### 일반 코드가 맡는 일

- 운영체제 활동 감지
- 유휴 시간 계산
- 데이터 마스킹
- API 검증
- 권한 규칙 평가
- 실제 도구 실행
- 상태 저장
- 롤백 및 감사 로그

### AI가 맡는 일

- 사용자 목표 후보 추론
- 목표 계층 제안
- 진행 단계와 미완성 사고 추정
- 공백 중 보호할 목표 생성
- 가능한 행동 계획 생성
- 복귀 브리핑 작성

## 5.2 가장 중요한 안전 경계

```text
Continuity Agent
      ↓ 행동 제안
Policy Engine
      ↓ 허용·승인·강등·거부
Tool Executor
      ↓ 실제 실행
Audit Log
```

AI가 직접 권한을 결정하거나 외부 API를 무제한 호출하지 않는다.

---

# 6. 기술 스택

## 6.1 확정 스택

| 영역 | 기술 | 목적 |
|---|---|---|
| 모노레포 | pnpm Workspace + Turborepo | 앱과 공통 패키지 관리 |
| 데스크톱 | Tauri 2 | 로컬 네이티브 기능과 데스크톱 패키징 |
| 네이티브 | Rust | 활성 창, 유휴 시간, 개인정보 필터 |
| 데스크톱 UI | React + Vite + TypeScript | 사용자 인터페이스 |
| UI 스타일 | Tailwind CSS + shadcn/ui | 빠른 MVP UI 제작 |
| 로컬 상태 | Zustand | 목표·공백·권한 UI 상태 |
| 서버 상태 | TanStack Query | REST API 캐시와 비동기 상태 |
| 백엔드 | Node.js + Fastify + TypeScript | REST, SSE, 에이전트 오케스트레이션 |
| 런타임 검증 | Zod v4 | API와 에이전트 출력 검증 |
| AI | OpenAI Agents SDK TypeScript | Agent loop, Tools, Approval, Tracing |
| 모델 API | OpenAI Responses API | 구조화 출력과 Function Tool 호출 |
| 클라우드 DB | PostgreSQL + Drizzle ORM | 서비스 상태 저장 |
| 로컬 DB | SQLite | 원시 활동 이벤트 로컬 저장 |
| 단위 테스트 | Vitest + Cargo Test | TypeScript와 Rust 단위 테스트 |
| E2E | Playwright | 전체 사용자 흐름 검증 |
| API 문서 | OpenAPI 3.1 | 계약 문서화 |

## 6.2 모델 설정

모델 이름을 코드에 직접 고정하지 않고 환경 변수로 관리한다.

```env
OPENAI_GOAL_MODEL=gpt-5-mini
OPENAI_CONTINUITY_MODEL=gpt-5.1
OPENAI_RECOVERY_MODEL=gpt-5-mini
```

운영 원칙:

- 목표 후보 및 체크포인트: 빠르고 비용 효율적인 모델
- Continuity 계획 및 도구 선택: 에이전트 작업에 강한 모델
- 실제 사용 가능한 모델은 프로젝트 계정의 `/v1/models` 결과로 확인
- 해커톤 직전 모델 가용성과 응답 형식을 재검증

## 6.3 통신 방식

| 구간 | 방식 |
|---|---|
| React ↔ Rust | Tauri IPC |
| Desktop ↔ Backend | HTTPS REST JSON |
| Backend → Desktop 진행 상태 | SSE |
| Backend ↔ OpenAI | Agents SDK / Responses API |
| Backend ↔ PostgreSQL | Drizzle ORM |

WebSocket은 MVP에서 사용하지 않는다. 서버에서 클라이언트로 진행 상태를 전달하는 단방향 흐름에는 SSE가 더 단순하다.

---

# 7. 모노레포 파일 구조

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

# 8. 폴더 의존성 규칙

```text
desktop React
  → packages/contracts 참조 가능
  → packages/db 직접 참조 금지
  → agents 직접 참조 금지

src-tauri
  → 로컬 활동 및 개인정보 처리
  → OpenAI API 직접 호출 금지

api/features
  → contracts, db 참조 가능
  → desktop 참조 금지

api/agents
  → contracts, tools 인터페이스 참조 가능
  → HTTP route 직접 호출 금지

api/tools
  → Policy Engine을 통과한 호출만 실행

policy
  → Agent에 의존하지 않는 순수 규칙 기반
```

## 8.1 공용 파일 소유권

| 공용 영역 | 최종 담당 |
|---|---|
| 루트 `package.json`, lockfile, workspace 설정 | 팀원 3 |
| `packages/contracts/**` | 팀원 3 |
| `packages/db/**`와 migration | 팀원 3 |
| `apps/api/src/app.ts` route 등록 | 팀원 3 |
| `apps/api/src/tools/registry.ts` | 팀원 4 |
| React router와 providers | 팀원 2 |
| Tauri 설정과 capabilities | 팀원 1 |

---

# 9. 공통 도메인 계약

공통 계약은 `packages/contracts`에 Zod 스키마와 TypeScript 타입으로 정의한다.

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

# 10. API 설계

## 10.1 공통 규칙

- Base path: `/api/v1`
- Content type: `application/json`
- ID: prefix가 붙은 ULID
- 서버 저장 시간: UTC ISO 8601
- UI 표시 시간: 사용자 로컬 시간
- 반복 실행 가능 요청: `Idempotency-Key` 사용

### 공통 헤더

```http
Content-Type: application/json
X-Device-Id: dev_01J...
X-Request-Id: req_01J...
Idempotency-Key: 01J...
```

### 공통 오류 응답

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "요청 데이터가 올바르지 않습니다.",
    "requestId": "req_01J...",
    "details": {}
  }
}
```

## 10.2 API 목록

| Method | Endpoint | 역할 |
|---|---|---|
| GET | `/health` | 서버 상태 |
| POST | `/observations/batches` | 정제된 활동 이벤트 전송 |
| GET | `/work-sessions/current` | 현재 작업 세션 조회 |
| POST | `/goals/infer` | 목표 후보 추론 |
| POST | `/goals/confirm` | 목표 선택 또는 수정 |
| GET | `/goals/current` | 현재 목표 조회 |
| PATCH | `/goals/:goalId` | 목표 수정 |
| POST | `/goals/:goalId/complete` | 목표 완료 |
| POST | `/checkpoints` | 체크포인트 생성 |
| GET | `/checkpoints/latest` | 최신 체크포인트 조회 |
| POST | `/gaps` | 공백 시작 |
| GET | `/gaps/:gapId` | 공백 상태 조회 |
| GET | `/gaps/:gapId/events` | SSE 상태 스트림 |
| POST | `/gaps/:gapId/end` | 공백 종료 |
| GET | `/gaps/:gapId/actions` | 계획 행동 목록 |
| POST | `/actions/:actionId/approve` | 행동 승인 |
| POST | `/actions/:actionId/reject` | 행동 거절 |
| POST | `/actions/:actionId/rollback` | 가역 행동 취소 |
| POST | `/gaps/:gapId/recovery-brief` | 브리핑 재생성 |
| GET | `/gaps/:gapId/recovery-brief` | 복귀 브리핑 조회 |
| GET | `/permission-profile` | 권한 프로필 조회 |
| PUT | `/permission-profile` | 권한 프로필 수정 |

## 10.3 주요 요청·응답

### 활동 이벤트 전송

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
        "title": "기말 프로젝트 보고서.docx",
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

### 목표 추론

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
      "title": "기말 프로젝트 보고서 작성",
      "description": "QR 분해 안정성을 조사하고 보고서에 반영하는 작업",
      "confidence": 0.84,
      "evidence": [
        {
          "type": "RESOURCE",
          "description": "기말 프로젝트 보고서 문서를 편집함"
        },
        {
          "type": "ACTIVITY_SEQUENCE",
          "description": "QR 분해 자료를 열람한 뒤 보고서로 복귀함"
        }
      ],
      "suggestedGoalPath": [
        "기말 프로젝트 완성",
        "보고서 작성",
        "QR 분해 설명 작성"
      ]
    }
  ],
  "requiresConfirmation": true,
  "inferenceSummary": "보고서 작성 가능성이 가장 높습니다."
}
```

### 목표 확인

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

### 체크포인트 생성

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

### 공백 시작

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

### 행동 승인

```http
POST /api/v1/actions/:actionId/approve
```

```json
{
  "approvalScope": "THIS_ACTION"
}
```

MVP에서는 `THIS_ACTION` 승인만 지원한다.

### 복귀 브리핑

```http
GET /api/v1/gaps/:gapId/recovery-brief
```

응답은 `RecoveryBrief` 공통 계약을 따른다. `externalEffects`는 비어 있어도 항상 포함한다.

## 10.4 SSE 이벤트

```text
event: agent.status
data: {"status":"planning"}

event: action.planned
data: {"actionId":"act_01","title":"참고자료 정리"}

event: action.completed
data: {"actionId":"act_01"}

event: approval.required
data: {"actionId":"act_02"}

event: recovery.ready
data: {"gapId":"gap_01"}
```

---

# 11. Agent 설계

## 11.1 MVP 에이전트 구성

MVP는 두 개의 에이전트만 사용한다.

### Goal Interpreter

책임:

- 활동 세션을 의미 있는 작업으로 해석
- 목표 후보 최대 3개 생성
- 각 후보의 근거와 신뢰도 반환
- 목표 계층 경로 제안
- 목표 변경 가능성 판단

도구 호출은 하지 않는다.

### Continuity Agent

책임:

- 공백 중 보호할 임시 목표 생성
- 성공 조건과 제약 조건 정의
- 현재 목표에서 행동 계획 생성
- 허용된 Tool 호출
- 결과를 평가하고 복귀 행동 추천

## 11.2 Goal Interpreter 출력 스키마

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

## 11.3 Continuity Agent 임시 목표 예시

```json
{
  "objective": {
    "title": "보고서 작성 흐름 보존",
    "successCriteria": [
      "현재 작업 상태를 잃지 않는다",
      "복귀 후 다음 행동을 즉시 알 수 있다",
      "허용된 준비 작업을 수행한다"
    ],
    "constraints": [
      "보고서의 주장과 결론을 임의로 바꾸지 않는다",
      "외부 메시지를 자동 발송하지 않는다",
      "원본 파일을 덮어쓰지 않는다"
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

## 11.5 Prompt 원칙

- 의학적 상태를 추론하거나 단정하지 않는다.
- 관찰된 사실과 AI 추론을 구분한다.
- 근거 없는 목표는 신뢰도를 낮게 준다.
- 사용자의 핵심 의사결정이 필요한 행동은 자동 실행하지 않는다.
- 도구가 없는 행동을 수행했다고 주장하지 않는다.
- 원본 수정보다 초안과 사본 생성을 우선한다.
- 각 행동에 목표와의 연결 이유를 제시한다.

---

# 12. Tool 설계

## 12.1 MVP Tool 목록

| Tool | 설명 | 기본 정책 |
|---|---|---|
| `create_checkpoint` | 현재 작업·미완성 생각·다음 행동 저장 | 자동 허용 |
| `create_todo_draft` | 내부 TODO 초안 생성 | 자동 허용 |
| `create_message_draft` | 메시지 초안 생성 | 자동 허용 |
| `organize_references` | 원본 이동 없이 가상 참고자료 목록 생성 | 자동 허용 |
| `generate_recovery_brief` | 복귀 브리핑 생성 | 자동 허용 |

## 12.2 Tool 작성 원칙

나쁜 예:

```typescript
doEverythingForUser();
```

좋은 예:

```typescript
createCheckpoint();
createTodoDraft();
createMessageDraft();
generateRecoveryBrief();
```

각 Tool은 다음을 반환한다.

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

## 12.3 Adapter 인터페이스

에이전트는 Google Calendar, Gmail 같은 공급자를 직접 알지 못한다.

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

MVP 구현:

```text
CalendarProvider
├─ MockCalendarProvider
└─ GoogleCalendarProvider (시간이 남을 때)

MessageProvider
├─ LocalMessageDraftProvider
└─ GmailDraftProvider (시간이 남을 때)
```

---

# 13. Policy Engine

## 13.1 정책 결과

```typescript
export type PolicyDecision =
  | "AUTO_EXECUTE"
  | "REQUIRE_APPROVAL"
  | "DOWNGRADE"
  | "DENY";
```

## 13.2 위험도별 기본 정책

| 등급 | 예시 | 처리 |
|---|---|---|
| Low | 요약, 체크포인트, TODO, 초안 | 자동 실행 |
| Medium | 이메일 Draft, 임시 캘린더 블록, Draft PR | 설정에 따라 승인 |
| High | 이메일 발송, 일정 확정 변경, 원본 문서 수정 | 복귀 후 승인 |
| Prohibited | 결제, 계약, 삭제, 의료 판단 | 거부 |

## 13.3 강등 예시

```json
{
  "requestedAction": "SEND_EMAIL",
  "decision": "DOWNGRADE",
  "allowedAction": "CREATE_EMAIL_DRAFT",
  "reason": "자동 이메일 발송 권한이 없습니다."
}
```

## 13.4 권한 프로필

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

# 14. 개인정보와 보안

## 14.1 로컬 우선 원칙

로컬에만 저장:

- 원시 활동 이벤트
- 전체 창 전환 기록
- 차단 앱 목록
- 유휴 시간 원본
- 정제 전 창 제목

서버로 전송 가능:

- 앱 이름
- 마스킹된 창 제목
- 리소스 종류
- 활동 시간 범위
- 목표 추론에 필요한 최소 요약

## 14.2 수집하지 않는 정보

- 비밀번호 입력
- 원시 키 입력
- 전체 화면 영상
- 시크릿 브라우저 활동
- 사용자가 차단한 앱의 내용
- 주민등록번호 등 식별정보
- 문서 전체 본문 기본 전송

## 14.3 로컬 Privacy Filter

OpenAI 또는 Backend 전송 전에 다음을 수행한다.

- 이메일 주소 마스킹
- 전화번호 마스킹
- 긴 숫자열 마스킹
- 비밀번호 필드 제외
- 민감 앱 제외
- 문서 전체 대신 제목·선택 요약 사용

## 14.4 OpenAI 데이터 사용 원칙

- API 키는 Backend 환경 변수에만 저장
- Desktop 바이너리에 API 키 포함 금지
- 모델 요청에 필요한 최소 Context만 전달
- Responses 호출은 기본적으로 `store: false`
- Tracing에는 민감한 원문을 넣지 않음
- 프로젝트 DB를 목표와 체크포인트의 주 저장소로 사용

## 14.5 감사 로그

각 행동마다 다음을 기록한다.

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

## 15.1 상태 머신

```text
ACTIVE
  ↓ 무활동 또는 사용자 입력
POSSIBLE_GAP
  ↓ 직접 시작 또는 추가 조건 충족
GAP_CONFIRMED
  ↓ 사용자 활동 재개
RECOVERING
  ↓ 복귀 브리핑 확인
ACTIVE
```

## 15.2 MVP 감지 방식

1순위:

- 사용자가 `공백 시작` 버튼 직접 클릭

2순위:

- 20분 무활동
- 활성 창 변화 없음
- 앱의 확인 요청에 응답 없음

자동 감지는 사용자가 설정에서 켠 경우에만 사용한다.

## 15.3 표현 원칙

잘못된 표현:

> “기면증이 감지되었습니다.”

사용할 표현:

> “작업 활동이 일정 시간 중단되었습니다.”

> “공백 모드를 시작할까요?”

---

# 16. 데이터베이스

## 16.1 MVP 테이블

```text
users
permission_profiles
work_sessions
activity_events
object_goals
checkpoints
gap_sessions
action_executions
recovery_briefs
audit_logs
```

계정 기능을 생략하면 `users`는 단일 Demo User로 Seed한다.

## 16.2 핵심 관계

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

## 16.3 원시 로그 보존

- Raw Activity Event: 로컬 SQLite
- 정제된 Observation Summary: PostgreSQL
- 목표·체크포인트·행동 결과: PostgreSQL
- 해커톤 Demo 데이터: Seed 및 Fixture 제공

---

# 17. 4인 팀 분업

## 17.1 역할 개요

| 팀원 | 역할 | 핵심 책임 |
|---|---|---|
| 팀원 1 | Native & Privacy Engineer | 활동 감지와 로컬 개인정보 처리 |
| 팀원 2 | Product & Frontend Engineer | 전체 사용자 경험과 UI |
| 팀원 3 | Backend & Data Engineer | REST, SSE, DB, 공통 계약 |
| 팀원 4 | Agent Engineer / Tech Lead | Goal Interpreter, Continuity Agent, Tools, Policy |

## 17.2 팀원 1 — Native & Privacy

담당 폴더:

```text
apps/desktop/src-tauri/**
```

필수 업무:

- Windows 활성 창 감지
- 유휴 시간 감지
- ActivityEvent 생성
- Tauri Commands
- 로컬 SQLite
- 차단 앱 및 개인정보 필터
- Observation API 전송 인터페이스

완료 기준:

- 활성 앱과 창 제목이 실시간으로 표시된다.
- 차단 앱에서는 이벤트가 생성되지 않는다.
- 정제된 ActivityEvent 배열을 반환한다.
- Observer가 없을 때 Mock 이벤트로 대체 가능하다.

## 17.3 팀원 2 — Product & Frontend

담당 폴더:

```text
apps/desktop/src/**
```

필수 화면:

- Dashboard
- 목표 후보 선택
- 현재 목표 및 진행 단계
- 공백 시작/종료
- Agent 진행 상태
- 행동 승인/거절
- 복귀 브리핑
- 권한 설정

완료 기준:

- Mock JSON만으로 전체 데모 흐름이 동작한다.
- API 접근이 `features/*/api.ts`로 분리된다.
- 로딩, 오류, 빈 상태가 처리된다.
- SSE 이벤트가 화면 상태에 반영된다.

## 17.4 팀원 3 — Backend & Data

담당 폴더:

```text
apps/api/src/features/**
apps/api/src/plugins/**
packages/contracts/**
packages/db/**
```

필수 업무:

- Fastify 서버
- REST API
- SSE Publisher
- Zod 요청/응답 검증
- Drizzle Schema와 Migration
- Repository와 Service
- 공통 계약 최종 관리
- Mock Agent Service
- 오류 및 Idempotency 처리

완료 기준:

- 모든 MVP endpoint가 Mock Agent로 동작한다.
- 상태가 DB에 저장된다.
- SSE 이벤트가 Desktop으로 전달된다.
- Agent 구현체를 인터페이스로 교체할 수 있다.

## 17.5 팀원 4 — Agent & Integration

담당 폴더:

```text
apps/api/src/agents/**
apps/api/src/tools/**
apps/api/src/policy/**
```

필수 업무:

- Goal Interpreter
- Continuity Agent
- Structured Output Schema
- Tool Calling
- Tool Registry
- Policy Engine
- Guardrails
- Agent Trace 및 Fixture 테스트
- 최종 Agent/Backend 통합

완료 기준:

- Fixture에서 목표 후보 JSON을 안정적으로 생성한다.
- 공백 중 Continuity Objective와 계획을 생성한다.
- 최소 3개의 Tool을 실제 호출한다.
- 위험 행동은 승인 대기, 강등 또는 거부된다.
- 도구 호출 실패 시 Recovery Brief에 실패 사실이 반영된다.

---

# 18. 동시 작업과 충돌 방지

## 18.1 병렬 개발 가능 조건

네 명이 동시에 작업할 수 있다. 단, 아래 세 가지를 먼저 확정한다.

1. `packages/contracts` 공통 타입
2. Mock JSON
3. API endpoint와 요청·응답 형태

## 18.2 수정 영역

| 팀원 | 주 수정 영역 | 직접 수정하지 않을 영역 |
|---|---|---|
| 1 | `apps/desktop/src-tauri/**` | React, API Agent |
| 2 | `apps/desktop/src/**` | Rust, DB, Agent 내부 |
| 3 | `features/**`, `contracts/**`, `db/**` | Frontend, Agent 내부 |
| 4 | `agents/**`, `tools/**`, `policy/**` | DB schema, HTTP route |

## 18.3 Mock 기반 독립 개발

### 팀원 1

API 없이 ActivityEvent 배열을 생성하고 JSON으로 저장한다.

### 팀원 2

다음 Mock 파일로 UI를 완성한다.

```text
apps/desktop/src/mocks/
├─ goal-candidates.json
├─ gap-session.json
├─ action-plan.json
└─ recovery-brief.json
```

### 팀원 3

AI 대신 다음 구현체를 사용한다.

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

### 팀원 4

Desktop과 DB 없이 Fixture Context로 Agent를 개발한다.

```typescript
const contextFixture = {
  applications: ["Microsoft Word", "Google Chrome"],
  resources: [
    "기말 프로젝트 보고서.docx",
    "QR Factorization Stability",
  ],
  recentActions: [
    "보고서 편집",
    "QR 분해 검색",
    "보고서로 복귀",
  ],
};
```

## 18.4 서비스 인터페이스

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

Mock 구현체를 실제 구현체로 교체하는 방식으로 통합한다.

---

# 19. Git 전략

## 19.1 브랜치

```text
main
├─ chore/bootstrap
├─ feat/desktop-observer
├─ feat/frontend-flow
├─ feat/backend-api
└─ feat/agent-engine
```

공통 계약 대규모 변경은 별도 브랜치를 사용한다.

```text
chore/contracts-v2
```

## 19.2 작업 규칙

- `main` 직접 push 금지
- 모든 변경은 PR
- 공용 파일은 담당자가 최종 수정
- 한 PR은 하나의 기능만 포함
- `contracts` 변경 PR은 다른 기능 PR보다 먼저 merge
- 새로운 의존성은 작은 별도 커밋으로 추가
- DB migration은 팀원 3만 생성
- Tool Registry는 팀원 4만 최종 수정

## 19.3 권장 커밋 메시지

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

실제 GitHub 계정명으로 교체한다.

---

# 20. 구현 순서

## Phase 0 — Bootstrap

담당: 전원, 최종 관리 팀원 3

- 모노레포 생성
- Workspace 설정
- 공통 TypeScript 설정
- 환경 변수 예시
- contracts 초안
- Mock JSON
- API endpoint 목록
- 데모 시나리오 확정

완료 조건:

- 네 명 모두 각자 앱을 실행할 수 있다.
- Mock 계약에 대한 이견이 없다.

## Phase 1 — 독립 병렬 개발

### 팀원 1

```text
Windows Observer
→ Privacy Filter
→ ActivityEvent
```

### 팀원 2

```text
Mock Goal
→ Gap UI
→ Action Progress
→ Recovery UI
```

### 팀원 3

```text
Fastify
→ PostgreSQL
→ REST
→ SSE
→ Mock Agent
```

### 팀원 4

```text
Fixture
→ Goal Interpreter
→ Continuity Agent
→ Tool Calls
→ Policy Engine
```

## Phase 2 — 1차 통합

```text
Observer
→ Observation API
→ Work Context
→ Goal Interpreter
→ Goal API
→ Goal UI
```

## Phase 3 — 2차 통합

```text
Gap UI
→ Gap API
→ Continuity Agent
→ Policy Engine
→ Tool Executor
→ SSE
→ Action UI
```

## Phase 4 — Recovery 통합

```text
Gap End
→ Action Results
→ Recovery Brief
→ Recovery UI
```

## Phase 5 — 데모 안정화

- 새 기능 추가 금지
- Demo Seed 고정
- 네트워크 실패 처리
- OpenAI 실패 시 Fixture fallback
- API 재시도 검증
- 발표용 로그 숨김/표시 옵션
- 전체 E2E 반복 테스트

---

# 21. 테스트 전략

## 21.1 단위 테스트

### Rust

- 활성 창 parser
- 차단 앱 필터
- 민감정보 redactor
- ActivityEvent 변환

### Backend

- Zod schema
- Policy Engine
- Risk Classifier
- Goal Service
- Gap 상태 전환

### Agent

- 구조화 출력 검증
- 목표 후보 수 1~3개
- 근거 없는 고신뢰도 방지
- 금지 행동 도구 미호출
- 이메일 발송 요청 강등

## 21.2 통합 테스트

- Observation → WorkSession
- Goal API → Agent Service
- Gap Start → Action Plan
- Approval → Tool Execution
- Gap End → Recovery Brief
- SSE 순서 및 재연결

## 21.3 E2E 테스트

```text
Mock activity 입력
→ 목표 후보 표시
→ 목표 선택
→ 공백 시작
→ 행동 계획 표시
→ 승인
→ 공백 종료
→ 복귀 브리핑 표시
```

## 21.4 실패 시나리오

- OpenAI 요청 실패
- 모델 출력 스키마 불일치
- Tool 실행 실패
- 중복 승인 요청
- SSE 연결 끊김
- DB 저장 실패
- 공백 중 사용자가 즉시 복귀
- 목표가 확인되지 않은 상태에서 공백 시작

---

# 22. 환경 변수

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

`.env` 파일은 Git에 올리지 않는다.

---

# 23. 개발 명령어 제안

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

# 24. UI 화면 정의

## 24.1 Dashboard

표시:

- 현재 활성 앱
- 현재 추론 목표
- 현재 목표 경로
- 목표 신뢰도와 근거
- 공백 시작 버튼
- 관찰 중지 버튼

## 24.2 Goal Confirmation

```text
현재 하시는 일을 추측했어요.

1. 기말 프로젝트 보고서 작성 84%
   QR 분해 자료를 조사하고 보고서에 반영 중

2. QR 분해 개념 공부 12%

[1번 선택] [2번 선택] [직접 입력]
```

## 24.3 Gap Status

```text
공백 모드가 활성화되었습니다.

현재 목표
기말 프로젝트 → 보고서 작성 → QR 분해 설명

에이전트 상태
• 목표 보호 계획 생성 완료
• 참고자료 정리 중
• 메시지 초안 생성 대기
```

## 24.4 Approval Dialog

반드시 표시:

- 요청 행동
- 행동 이유
- 사용 데이터
- 외부 영향
- 취소 가능 여부

## 24.5 Recovery Brief

```text
38분 동안 작업 흐름이 중단되었습니다.

공백 전 목표
기말 프로젝트 → 보고서 작성 → QR 분해 설명

완료한 작업
✓ 참고자료 3개 정리
✓ 다음 문단 개요 작성
✓ 팀 메시지 4개 요약

외부에 전송한 내용
없음

다음 추천
QR 분해 안정성 개요 검토 — 약 10분
```

---

# 25. 성공 지표

## 25.1 해커톤 성공 기준

- 전체 데모가 한 번도 수동 DB 수정 없이 동작
- 목표 후보가 구조화된 JSON으로 반환
- Agent가 3개 이상의 Tool 중 상황에 맞는 Tool을 선택
- Policy Engine이 위험 행동을 차단 또는 강등
- 복귀 브리핑에 모든 외부 영향이 표시
- 네 명이 병렬 개발한 코드가 공통 계약으로 통합

## 25.2 제품 지표 후보

- 복귀 후 첫 유효 행동까지 걸린 시간
- 목표 후보 선택 정확도
- 사용자가 목표를 직접 수정한 비율
- 자동 실행 행동의 승인 취소율
- Recovery Brief 유용성 평가
- 공백 전후 목표 유지율

---

# 26. 위험 요소와 대응

| 위험 | 영향 | 대응 |
|---|---|---|
| 목표 추론 오류 | 잘못된 작업 흐름 | 후보 최대 3개와 사용자 확인 |
| 개인정보 과수집 | 신뢰 훼손 | 로컬 필터, 차단 앱, 최소 전송 |
| 에이전트 과잉 행동 | 외부 피해 | Policy Engine, 승인, 강등 |
| OpenAI 지연 | 데모 실패 | Fixture fallback, timeout |
| 네 명의 계약 불일치 | 통합 실패 | contracts 단일 소유자 |
| lockfile 충돌 | 빌드 실패 | 팀원 3이 의존성 최종 관리 |
| Windows Observer 불안정 | 입력 데이터 없음 | Demo Event Generator |
| SSE 연결 실패 | 진행 상태 미표시 | 상태 polling fallback |
| 긴 개발 범위 | 미완성 | 5개 Tool, 2개 Agent로 고정 |

---

# 27. 최종 체크리스트

## 공통

- [ ] 모노레포 실행 가능
- [ ] contracts 확정
- [ ] Mock JSON 확정
- [ ] Demo Seed 확정
- [ ] `.env.example` 작성

## Desktop Native

- [ ] 활성 창 감지
- [ ] 유휴 시간 감지
- [ ] 차단 앱 필터
- [ ] ActivityEvent 생성
- [ ] Mock Observer fallback

## Frontend

- [ ] Dashboard
- [ ] Goal Confirmation
- [ ] Gap Status
- [ ] Approval Dialog
- [ ] Recovery Brief
- [ ] SSE 연동

## Backend

- [ ] REST endpoint
- [ ] PostgreSQL schema
- [ ] SSE Publisher
- [ ] Mock Agent Service
- [ ] Error Handler
- [ ] Audit Log

## Agent

- [ ] Goal Interpreter
- [ ] Continuity Agent
- [ ] Structured Output
- [ ] 5개 Tool
- [ ] Policy Engine
- [ ] Tool failure 처리

## Demo

- [ ] 발표용 활동 시나리오
- [ ] OpenAI 실패 fallback
- [ ] 외부 전송 없음 표시
- [ ] 위험 행동 차단 시연
- [ ] 전체 흐름 3회 이상 연속 성공

---

# 28. 공식 기술 참고

- OpenAI Agents SDK for TypeScript
  - Agent loop
  - Function tools with Zod validation
  - Human-in-the-loop approvals
  - Sessions
  - Tracing
- OpenAI Responses API
  - Function calling
  - Structured Outputs with JSON Schema
  - `store` 설정과 데이터 제어
- Tauri 2
  - React/Vite 기반 Desktop frontend
  - Rust command와 capability 설정
- Fastify
  - TypeScript server 및 plugin 구조
- Zod v4
  - API와 Agent 출력 런타임 검증

관련 라이브러리 버전과 모델 가용성은 해커톤 시작 시점에 공식 문서와 프로젝트 계정에서 다시 확인한다.

---

# 29. 최종 요약

```text
팀원 1은 사용자의 행동을 안전하게 관찰한다.
팀원 2는 사용자가 에이전트를 이해하고 통제하게 한다.
팀원 3은 데이터와 API 계약을 연결한다.
팀원 4는 목표를 추론하고 허용된 행동을 계획·수행한다.
```

네 명은 같은 코드를 동시에 고치는 것이 아니라, **고정된 공통 계약을 기준으로 각자의 구현체를 병렬 개발**한다.

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

이 프로젝트의 가장 중요한 차별점은 다음 문장으로 정리한다.

> **대부분의 AI는 사용자가 시킨 작업을 수행한다. 이 에이전트는 사용자가 잠시 사라졌을 때도 사용자의 목표가 사라지지 않도록 지킨다.**
