# Branchdeck Architecture, Security, and Code Quality Audit
**Author:** Antigravity (Principal Software Engineer)  
**Date:** July 16, 2026  
**Audited Target:** Branchdeck Codebase (Full-Stack VS Code Integrated Codebase Intelligence SaaS)

---

## 1. COMPLETE SYSTEM UNDERSTANDING

Branchdeck is a multi-tier codebase intelligence and visualization application composed of:
1.  **Frontend/Client**: A Next.js (version 16.2.10) application that provides a marketing landing page, an interactive dashboard using `@xyflow/react` (React Flow) for call graphs, and collaboration features backed by Supabase.
2.  **API Gateway / Proxy**: Next.js App Router API endpoints that act as middlewares, validating client sessions, proxying requests to the backend, and executing client-side/server-side fallbacks.
3.  **Core Indexing & Graph Engine**: A FastAPI Python backend that parses codebase repositories using Tree-Sitter AST parser, writes nodes/edges to a database, and runs recursive path analysis (BFS call flow and CTE impact analysis).
4.  **Database**: A PostgreSQL database (with `pgvector` enabled) used to store codebase entities (repositories, commits, nodes, edges, AST parser caches), falling back to SQLite for local development.
5.  **VS Code Extension**: A TypeScript VS Code extension that scans local folders, forwards relative file paths to the Next.js app running inside an iframe, and responds to click events to open specific files.

### 1.1 Complete Data Flow Map

```
User Action (e.g., Click "Inspect Impact Path")
      ↓
Frontend Component ([page.tsx](file:///c:/Users/adel/Downloads/Projects/Branchdeck/webapp/src/app/page.tsx) / [CallFlowGraph.tsx](file:///c:/Users/adel/Downloads/Projects/Branchdeck/webapp/src/components/CallFlowGraph.tsx))
      ↓
API Request: `POST /api/impact` with JWT (client-side `authenticatedFetch`)
      ↓
Next.js Route handler ([route.ts](file:///c:/Users/adel/Downloads/Projects/Branchdeck/webapp/src/app/api/impact/route.ts)) 
      ↓ [Proxy Request via Fetch with Correlation ID & JWT Forwarding]
FastAPI Controller (`POST /api/impact` in [main.py](file:///c:/Users/adel/Downloads/Projects/Branchdeck/backend/main.py))
      ↓ [Verify JWT signature, extract Organization ID context, enforce tenant check]
Database Engine (Recursive CTE query `get_downstream_impact` in [database.py](file:///c:/Users/adel/Downloads/Projects/Branchdeck/backend/database.py))
      ↓ [Extract all calling nodes recursively up to depth 10]
Response returned to Next.js API Gateway -> returned to Frontend client
      ↓
Frontend Component updates state (`setImpactData`) -> triggers visual re-render of [ImpactPanel.tsx](file:///c:/Users/adel/Downloads/Projects/Branchdeck/webapp/src/components/ImpactPanel.tsx)
```

### 1.2 Core Workflows Traced

#### Workflow A: Codebase Workspace AST Indexing
1.  **Trigger**: User triggers "Scan Workspace" from the VS Code extension panel or inputs a GitHub repository URL.
2.  **VS Code Scan**: Extension collects relative file paths matching code files (TS, PY, GO, etc.) and posts them to the Next.js iframe.
3.  **Frontend Post**: Client calls `/api/analyze` forwarding paths and absolute workspace directory.
4.  **Next.js Proxy**: Next.js route forwards to FastAPI backend `/api/analyze` along with the JWT auth header.
5.  **FastAPI JWT Gate**: Decodes HS256 JWT, validates expiration, extracts user's `organization_id`.
6.  **Repo Register**: Verifies or inserts `repos` and `commits` records scoped to the tenant organization.
7.  **AST Indexing Pass (Content-Addressed)**:
    *   Iterates through each file, calculates SHA-256 hash.
    *   Queries `file_cache` table. If cached, retrieves parsed AST summary. If cache miss, calls Tree-Sitter (`parser.py`) to parse imports, declarations, and calls, then writes back to cache.
    *   Creates/inserts `CodeNode` records (`repo_id:commit_sha:file_path`).
8.  **Graph Edge Builder Pass**:
    *   For each file, parses import specifiers to resolve target files (drawing `imports` edges).
    *   Iterates through call expressions and resolves them against declarations mapping inside the commit (drawing `calls` edges).
9.  **Response**: Returns code graph nodes and edges to frontend client. Next.js falls back to local `ts-morph` AST parser client-side if the FastAPI server is down.

#### Workflow B: Collaborative Real-time Presence
1.  **Presence Sync**: Done through Supabase Realtime Channels (`useCollaboration` in `InviteTeamModal.tsx`).
2.  **State broadcast**: When a user selects a file or focuses on a directory, their active location (`currentFile`, `currentFeature`) is broadcasted to all other users connected to the channel.
3.  **Visualization**: Colleague avatars glow and float directly adjacent to active nodes in [CallFlowGraph.tsx](file:///c:/Users/adel/Downloads/Projects/Branchdeck/webapp/src/components/CallFlowGraph.tsx).

---

## 2. ARCHITECTURE REVIEW

### 2.1 Frontend Architecture
*   **Framework**: Next.js 16.2.10 with React 19.2.4. Uses the App Router layout.
*   **Component Organization**: Organized under `src/components/` (UI elements, modals, panels) and `src/app/` (routes). State is managed via React hooks (`useState`, `useMemo`, `useEffect`) passed down through components.
*   **Error Boundaries**: No React Error Boundaries (`ErrorBoundary` components) are configured around key dashboard panes. A rendering crash in `React Flow` (e.g. from cyclic configurations or null identifiers) will crash the entire dashboard view.
*   **Loading & Empty States**: Loading skeletons are configured on `CallFlowGraph`, `StoryMode`, and `ImpactPanel`. Empty states are clean but heavily rely on mock data transitions rather than informative onboarding guides.
*   **Accessibility (a11y)**: Missing `aria-*` tags on custom components (e.g. `AuthModal`, custom sliders, sidebars). Theme toggles and inputs lack descriptive label associations.
*   **Performance Optimization**: High risk of re-renders. Large trees are filtered dynamically in `useMemo` on `page.tsx` using quadratic lookup operations (`callEdges.filter(...)` and nested arrays). While this is optimized for small/medium graphs, loading monorepos with 1,000+ files will cause noticeable main-thread lag.

### 2.2 Backend Architecture
*   **Service Separation**: Backend logic is placed inside `main.py` (FastAPI routing and business orchestration) and `parser.py` (Tree-sitter interface). A cleaner design requires moving SQL controllers, parsing pipelines, and authentication middlewares into separate modules.
*   **Request Validation**: Implemented using Pydantic models (`AnalyzePayload`, `ImpactPayload`, `CallFlowPayload`, `StoryPayload`). Input shapes are strictly enforced.
*   **Error Handling**: Basic try-except wraps are used. Handlers return 401/403/422 status codes properly.
*   **Concurrency & Scalability**:
    *   **Blocking Indexing**: Indexing and AST scanning run *synchronously* inside the HTTP request-response loop (`POST /api/analyze`). For medium-sized codebases (100+ files), the HTTP request will block, risking gateways timeouts.
    *   **No Queue**: Lacks Celery, Redis Queue, or background tasks for parsing.
    *   **No Rate Limiting**: Backend has no rate-limiting middleware, making it highly vulnerable to Denial of Service (DoS) attacks.

### 2.3 Database Architecture
*   **Schema Design**: Standard normalized relations. Primary keys are structured composite identifiers (`repo_id:commit_sha:file_path`), which simplifies lookup.
*   **Tenancy Checks**: Properly enforced across all routes joining `repos` on the `organization_id` extracted from JWT.
*   **Indexes**: Missing database-level indexes on FK relations (like `code_edges.from_id`, `code_edges.to_id`, `repos.organization_id`). This will result in full-table scans for large graphs.
*   **Pgvector Fallback**: SafeVector handles postgres vs sqlite dialetcs, which is great for local setup but introduces schema variance in testing.

---

## 3. FEATURE-BY-FEATURE FUNCTIONALITY TEST

| Feature | Location | Files Involved | Expected Behavior | Actual Behavior | Issues Found | Severity | Fix Required |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Workspace Scanning** | FastAPI `/api/analyze` / Extension scan | `main.py`, `parser.py`, `server-analyzer.ts` | Performs deep AST parsing on files, stores nodes/edges, and returns data. | Works if backend is live. Falls back to Next.js `ts-morph` scanner if offline. | AST generation blocks HTTP thread; Next.js fallback resolves relative imports poorly. | **High** | Move scan step to background jobs; unify AST import parsers. |
| **Visual Call Flow** | FastAPI `/api/callflow` | `main.py`, `CallFlowGraph.tsx` | BFS traversal returns live nodes and edges of call graph. | Works; falls back to static e-commerce mock if database is empty. | Graph visual rendering will crash if recursive cycles exist. | **Medium** | Sanitize nodes and edges array inputs against circular references. |
| **Impact Analysis** | FastAPI `/api/impact` | `main.py`, `database.py`, `ImpactPanel.tsx` | Recursive CTE retrieves all downstream callers of a node. | Works; falls back to client-side graph walk or hardcoded mocks if offline. | Client-side fallback ignores actual dependencies. | **Medium** | Disable offline simulations when working in real project mode. |
| **AI Story Mode** | FastAPI `/api/story` | `main.py`, `StoryMode.tsx` | Translates AST call paths to structural stories using Gemini API. | Works if API key is present. Otherwise falls back to rule-based template script. | Verification pass checks symbols but ignores semantic accuracy. | **Low** | Provide a better local template schema. |
| **Codebase Q&A** | Client-side search | `page.tsx` | Natural language search answers questions about code structure. | **100% Mocked**. Matches terms in string query to trigger mock responses. | Complete fake implementation pretending to be AI search. | **Critical** | Build a real retrieval-augmented generation (RAG) vector lookup. |
| **Team Invite** | Next.js API `/api/team/invite` | `invite/route.ts`, `InviteTeamModal.tsx` | Inserts invitations into Supabase and sends email invites. | Inserts into Supabase, but falls back to `localStorage` + no-op if DB fails. | Resend SDK is stubbed (no-op) and missing from `package.json`. | **High** | Install `resend` package and add proper credentials. |
| **GitHub Org Sync** | Next.js API `/api/team/github-org` | `github-org/route.ts` | Syncs organization members list. | Fetches from GitHub, but does **not** persist members to DB. | Sync is a facade; does not create database entries. | **High** | Save synced members into tenant organization tables. |
| **Admin Waitlist** | `/admin` dashboard | `admin/page.tsx`, `waitlist/route.ts` | Secures waitlist database access behind passcode token. | Works, but checks token using hardcoded fallback defaults. | Vulnerable to default credential bypass. | **High** | Force configuration of `ADMIN_PASSCODE` in environment. |

---

## 4. COMPLETE USER JOURNEY TEST

1.  **Landing Page / Marketing**:
    *   *Result*: Passes. Very clean, premium visual aesthetic. Hover effects and interactive modals work as expected.
2.  **Waitlist Sign-up**:
    *   *Result*: Passes. Correctly writes `fullName`, `email`, `company`, `role` into Supabase `waitlist` table.
3.  **Onboarding / Authentication**:
    *   *Result*: **Fails**. Supabase auth handles signup/signin, but the JWT organization context is not populated by default.
    *   *Blocker*: A fresh signup creates a user in `auth.users`, but when their token is sent to FastAPI backend, it throws `401 Unauthorized: missing organization identity context` since standard Supabase signups do not assign an `organization_id` to JWT metadata.
4.  **Project Upload / Code Intelligence**:
    *   *Result*: Passes for local development (uses fallback mocks or sqlite setup), but fails on production postgres without custom database scripts.
5.  **Interactive Exploration**:
    *   *Result*: Passes. Clicking nodes properly loads downstream impact analysis, and presence channels synchronize active viewers.

---

## 5. NO MOCK DATA / FAKE IMPLEMENTATION CHECK

*   **Mock data inside Next.js APIs**: `/api/analyze`, `/api/callflow`, `/api/impact`, and `/api/story` contain heavy fallbacks to `ECOMMERCE_DEMO_CALLS`.
    *   *Why this is unacceptable*: If the backend fails or takes too long, the system silently serves dummy e-commerce screens, misleading users into seeing a fake environment.
    *   *Solution*: Remove static mock fallbacks. Throw detailed HTTP status alerts (e.g. 503 Service Unavailable) so the client handles server offline states explicitly.
*   **Client-Side Q&A Regex Matcher ([page.tsx:L504-627](file:///c:/Users/adel/Downloads/Projects/Branchdeck/webapp/src/app/page.tsx#L504-L627))**:
    *   *Why this is unacceptable*: The search input claims to be an AI codebase search engine but is powered by `query.includes('delete')` and hardcoded text blocks.
    *   *Solution*: Replace with a semantic search pipeline. Implement embedding generation for code files on commit indexing and run cosine similarity search using the `pgvector` index in Postgres.
*   **Stubbed Email Sender ([resend.ts:L15-49](file:///c:/Users/adel/Downloads/Projects/Branchdeck/webapp/src/lib/resend.ts#L15-L49))**:
    *   *Why this is unacceptable*: The file defines a fake client stub that claims to succeed but prints warn logs.
    *   *Solution*: Install `resend` library via npm and configure a verified sending domain.

---

## 6. API AUDIT

### 6.1 FastAPI Endpoints

#### `POST /api/analyze`
*   **Auth Required**: Yes (JWT signature verified).
*   **Input Validation**: `AnalyzePayload` (workspacePath, files, url).
*   **Database Interaction**: Deletes old commit graph records and writes new `repos`, `commits`, `code_nodes`, and `code_edges`.
*   **Security Concerns**: High memory overhead. Standard path joining `os.path.join(clean_workspace, file)` could allow directory traversal if paths contain `../../`.

#### `POST /api/impact`
*   **Auth Required**: Yes (JWT signature verified).
*   **Input Validation**: `ImpactPayload` (targetNodeId, commitSha).
*   **Database Interaction**: Executes recursive CTE traversal on `code_edges`.
*   **Security Concerns**: No recursion depth protection beyond `depth < 10`. Extremely large cycles can cause long transaction locks.

### 6.2 Next.js Proxies
*   **Endpoints**: `/api/analyze`, `/api/callflow`, `/api/impact`, `/api/story`.
*   **Vulnerability**: They do not validate if the incoming `Authorization` token matches the current session on the Next.js side, they just forward it. This is fine because FastAPI validates the signature, but exposes the API proxy wrapper to unauthorized usage.

---

## 7. SECURITY AUDIT

### 7.1 Key Vulnerabilities Found

> [!CAUTION]
> **Vulnerability 1: Hardcoded HS256 Secret Fallback ([main.py:L69](file:///c:/Users/adel/Downloads/Projects/Branchdeck/backend/main.py#L69))**
> *   *Code*: `SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "super-secret-supabase-jwt-key-for-local-dev")`
> *   *Risk*: If `SUPABASE_JWT_SECRET` is left unconfigured in production, an attacker can craft a fake JWT signed with the fallback key and claim to be any organization admin, gaining complete read/write access to all codebase repositories.

> [!WARNING]
> **Vulnerability 2: Path Traversal Vulnerability ([main.py:L262](file:///c:/Users/adel/Downloads/Projects/Branchdeck/backend/main.py#L262))**
> *   *Code*: `full_path = os.path.join(clean_workspace, file)`
> *   *Risk*: If a malicious client sends file paths like `../../etc/passwd` inside the `files` array, the backend will attempt to read arbitrary host system files and compute their ASTs or hashes.

> [!WARNING]
> **Vulnerability 3: Hardcoded Admin Passcode Default ([route.ts:L10](file:///c:/Users/adel/Downloads/Projects/Branchdeck/webapp/src/app/api/admin/waitlist/route.ts#L10))**
> *   *Code*: `const expectedPasscode = process.env.ADMIN_PASSCODE || "branchdeck-admin-passkey";`
> *   *Risk*: Fallback default allows access to the waitlist signups if the environment variable is not configured.

---

## 8. AI SYSTEM AUDIT

*   **Integration**: Connects to `gemini-1.5-flash` to write stories.
*   **Prompt Leakage / JSON Verification**: The prompt asks to return raw JSON arrays. If Gemini includes markdown backticks (e.g. ` ```json `), the parsing regex `re.search(r'\[.*\]', text, re.DOTALL)` might fail and trigger a fallback.
*   **Token Optimization**: Passes raw relations string. This is low-token usage, which is cost-effective.
*   **Verification Filter**: The verification filter runs after LLM output to match words against code symbols. This is a very clean, production-ready sanitization technique.

---

## 9. DATABASE REALITY CHECK

*   **Database persistence**: Works. Data successfully persists across restarts.
*   **SQLite Fallback Hazard**: If PostgreSQL is down during backend initialization, it silently initializes SQLite. This creates a state divergence where some nodes write to Postgres, and some write to a local sqlite file.
*   **Pgvector usage**: SQLite type decorator falls back to JSON. This means semantic similarity searches will crash on SQLite because it lacks vector computation functions.

---

## 10. Final CTO-Level Report

### Executive Summary

> [!CRITICAL]
> **Is Branchdeck ready for public public launch?**
> **NO.**
> The application cannot be launched as a production SaaS today. While it looks visually premium and has functional AST indexing parsers, it contains **critical security vulnerabilities** (fallback JWT secrets, path traversal vectors), **missing core library packages** (Resend), and a **fake client-side Q&A implementation** that acts as a placeholder.

### Production Readiness Score

*   **Architecture**: `5 / 10` (Synchronous AST scanning blocks HTTP loop; missing background queues)
*   **Frontend**: `7 / 10` (Premium visual design; missing error boundaries and accessibility controls)
*   **Backend**: `6 / 10` (Strict Pydantic validations, but lack of route rate-limiting and async worker processing)
*   **Database**: `6 / 10` (Tenancy checks work, but missing FK indexes and silent SQLite fallback introduces instability)
*   **Security**: `3 / 10` (Default JWT secrets, default admin tokens, directory traversal risk)
*   **Performance**: `5 / 10` (Graph parsing blocks main thread; UI memo algorithms are quadratic)
*   **Testing**: `8 / 10` (Excellent integration test coverage for JWT and tenancy boundaries in `test_api.py`)

### Critical Launch Blockers (Fix Required Before Public Launch)

1.  **Vulnerability 1**: Remove the fallback secret in `main.py` for JWT signature verification. Crash the app if `SUPABASE_JWT_SECRET` is missing.
2.  **Vulnerability 2**: Implement path resolution checks inside `main.py` to prevent reading files outside the designated workspace directory (directory traversal check using `Path(full_path).resolve()`).
3.  **Authentication Gap**: Establish a webhook or registration trigger in Supabase to inject tenant/organization metadata into user profiles so that auth tokens contain the verified `organization_id` claims required by the backend.
4.  **Mocked Feature**: Implement real semantic search on the backend using embedding queries in PostgreSQL to replace the mocked client-side regex Q&A.
5.  **Broken Dependency**: Install the `resend` package and configure email API credentials.

### Final Recommendation

**Needs major engineering work** before public launch. Specifically, the team must address backend request processing logic, remove mock search overrides, and tighten secret management strategies.
