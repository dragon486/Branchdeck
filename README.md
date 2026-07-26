<div align="center">

# 🗺️ Branchdeck

**Understand large codebases in hours, not weeks.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](webapp/tsconfig.json)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](webapp/package.json)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?logo=fastapi&logoColor=white)](backend/requirements.txt)
[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white)](backend/requirements.txt)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/dragon486/Branchdeck/issues)

<br/>

Branchdeck is a **developer intelligence platform** that parses your codebase with tree-sitter, builds a live dependency graph backed by PostgreSQL + pgvector, and surfaces four AI-powered features — Project Map, Visual Call Flow, Impact Analysis, and Story Mode — all from a Next.js web app and a VS Code extension.

</div>

---

## Table of Contents

- [Features](#-features)
- [Architecture](#️-architecture)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Local Development](#-local-development)
- [Docker (Full Stack)](#-docker-full-stack)
- [Environment Variables](#-environment-variables)
- [Running Tests](#-running-tests)
- [VS Code Extension](#-vs-code-extension)
- [API Reference](#-api-reference)
- [Security](#-security)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

| Feature | Description | Status |
|---|---|---|
| 🗺️ **AI Project Map** | Generates a dependency graph of your entire codebase, colour-coded by layer (UI, API, DB, worker, external, service) | ✅ Live |
| 🔀 **Visual Call Flow** | Renders an interactive node graph of function call chains up to 3 hops deep, sourced from real AST data | ✅ Live |
| 💥 **Impact Analysis** | Runs a CTE query on the graph to find every downstream node that would be affected by changing a symbol | ✅ Live |
| 📖 **Story Mode** | AI-generated narrative walkthrough of architecture paths, powered by Gemini (with a local rules narrator fallback) | ✅ Live |
| 💬 **Codebase Q&A** | Natural-language queries against the dependency graph | 🟡 Demo |

---

## ⚙️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      User Browser                       │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│           Next.js Frontend (Port 3000)                  │
│   page.tsx · /api/analyze · /api/callflow               │
│            /api/impact · /api/story                     │
│                                                         │
│  Fallback: ts-morph local AST parser (offline mode)     │
└──────────────────────────┬──────────────────────────────┘
                           │  JWT-authenticated proxy
┌──────────────────────────▼──────────────────────────────┐
│           FastAPI Engine (Port 8000)                    │
│   /api/analyze · /api/impact · /api/callflow            │
│   /api/story · Pydantic validation · JWT verification   │
│                                                         │
│   tree-sitter parser.py  ·  database.py ORM            │
│   Gemini API (optional)  ·  JSON structured logging     │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│     PostgreSQL + pgvector (Port 5432)                   │
│  repos · commits · code_nodes · code_edges · file_cache │
└─────────────────────────────────────────────────────────┘
```

### Request flow at a glance

1. **`/api/analyze`** — Proxies to FastAPI → tree-sitter parses files → graph written to Postgres. Falls back to ts-morph if FastAPI is offline.
2. **`/api/callflow`** — Queries `code_nodes` / `code_edges` with a BFS up to depth 3.
3. **`/api/impact`** — Executes a recursive CTE (`get_downstream_impact`) on the graph.
4. **`/api/story`** — Traces graph paths → Gemini API narrative (or local rules narrator if `GEMINI_API_KEY` is absent).

---

## 📁 Project Structure

```
Branchdeck/
├── backend/                  # FastAPI engine
│   ├── main.py               # All API routes, BFS, CTE queries, story generation
│   ├── parser.py             # tree-sitter AST → code_nodes / code_edges
│   ├── database.py           # SQLAlchemy ORM, schema, pgvector setup
│   ├── secure_file_handler.py
│   ├── services/
│   ├── test_api.py           # Integration + security tests (testcontainers)
│   ├── test_parser.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── webapp/                   # Next.js frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx      # Main dashboard (66 KB — all four features)
│   │   │   ├── api/          # Next.js route handlers (proxy + fallback)
│   │   │   └── layout.tsx
│   │   ├── components/       # React component library
│   │   └── lib/
│   │       └── server-analyzer.ts  # ts-morph fallback AST parser
│   ├── package.json
│   └── Dockerfile
│
├── extension/                # VS Code extension
│   ├── src/                  # Extension source
│   ├── media/                # Icons
│   ├── package.json          # Commands, menus, activation events
│   └── branchdeck-vscode-*.vsix
│
├── landing/                  # Static marketing site
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── docker-compose.yml        # Full-stack: db + backend + webapp
├── ARCHITECTURE_AS_BUILT.md  # Detailed verified architecture notes
└── RUNBOOK.md                # Step-by-step setup guide
```

---

## 📋 Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 | For the Next.js webapp |
| Python | ≥ 3.12 | For the FastAPI backend |
| PostgreSQL | ≥ 16 with pgvector | Or use Docker Compose |
| Docker & Docker Compose | Any recent | Optional — for one-command full-stack startup |
| Git | Any | Required for repo analysis |

---

## 🛠️ Local Development

### 1. Database

Start a local Postgres + pgvector instance (the quickest way):

```bash
docker compose up db -d
```

Or point `DATABASE_URL` to any existing PostgreSQL 16+ server with `pgvector` enabled.

---

### 2. Backend (FastAPI)

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv

# Windows (PowerShell)
.\\venv\\Scripts\\Activate.ps1
# macOS / Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment (see Environment Variables below)
# Start the server with live reload
uvicorn main:app --reload --port 8000
```

Interactive API docs are available at **http://localhost:8000/docs**.

---

### 3. Frontend (Next.js)

In a new terminal:

```bash
cd webapp
npm install
npm run dev
```

Open **http://localhost:3000** in your browser. The Next.js API routes automatically proxy backend requests to FastAPI on port 8000.

> **Offline mode**: If the FastAPI backend is unreachable, the frontend transparently falls back to local TypeScript AST parsing using `ts-morph`. You'll still get a working project map — without database persistence.

---

## 🐳 Docker (Full Stack)

Spin up the entire stack — database, backend, and webapp — with a single command:

```bash
# Copy and fill in your secrets first
cp .env.example .env   # or set the variables below manually

docker compose up --build
```

Services:

| Service | Port | URL |
|---|---|---|
| webapp (Next.js) | 3000 | http://localhost:3000 |
| backend (FastAPI) | 8000 | http://localhost:8000/docs |
| db (PostgreSQL + pgvector) | 5432 | localhost:5432 |

---

## 🔑 Environment Variables

### Backend (`backend/`)

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/postgres` |
| `GEMINI_API_KEY` | Enables AI-generated Story Mode narratives | *Optional — falls back to local rule narrator* |
| `SUPABASE_JWT_SECRET` | Secret used to verify JWT tokens from Next.js | `dev_jwt_secret_change_me_in_prod_32chars` |
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) | `http://localhost:3000` |
| `GITHUB_TOKEN` | GitHub API token for private repository access | *Optional* |

> **⚠️ Fail-fast**: The backend **will refuse to start** if `DATABASE_URL` contains `postgresql://` but the server is unreachable. Silent SQLite fallback is intentionally disabled to prevent environment drift.

### Webapp (`webapp/`)

| Variable | Description |
|---|---|
| `BACKEND_URL` | Internal URL of the FastAPI backend (used by Next.js server-side proxy) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (for future auth integration) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_JWT_SECRET` | Must match the backend secret |

---

## 🧪 Running Tests

### Backend (Python)

Runs the full integration and security test suite against a real PostgreSQL container:

```bash
cd backend
pytest
```

> Requires Docker to be running — tests use `testcontainers-postgres` to spin up an isolated database automatically. No silent SQLite fallback.

The security test suite (`test_api.py`) explicitly verifies:
- Expired JWT tokens are rejected
- `alg: none` exploit attempts are blocked
- Incorrect signature algorithms are rejected
- Cross-tenant queries return `403 Forbidden`

### Frontend (TypeScript)

Type-check the entire webapp without emitting:

```bash
cd webapp
npx tsc --noEmit
```

---

## 🧩 VS Code Extension

Branchdeck ships a VS Code extension that embeds all four features directly in your editor.

### Install from `.vsix`

```bash
code --install-extension extension/branchdeck-vscode-0.1.5.vsix
```

Or install via the VS Code Extensions panel → **Install from VSIX…** → select `extension/branchdeck-vscode-0.1.5.vsix`.

### Commands

| Command | How to trigger | Description |
|---|---|---|
| `Branchdeck: Show AI Project Map` | Command Palette | Renders the full codebase dependency graph |
| `Branchdeck: Visual Call Flow (Selected Function)` | Right-click any selection | Shows the call chain from the selected function |
| `Branchdeck: Analyze Impact Scope` | Right-click any selection | Shows all code affected if this symbol changes |
| `Branchdeck: Architecture Walkthrough` | Command Palette | Generates an AI Story Mode walkthrough |

---

## 📖 API Reference

All endpoints are on the **FastAPI backend** (port 8000). Next.js `/api/*` routes proxy to these with JWT-authenticated headers.

### `POST /api/analyze`
Clones or scans a repository, parses all files with tree-sitter, and persists the dependency graph.

**Request body:**
```json
{
  "repoUrl": "https://github.com/owner/repo",
  "branch": "main"
}
```

### `GET /api/callflow`
Returns a call graph for a specific function up to 3 hops deep.

**Query params:** `nodeId`, `commitSha`

### `POST /api/impact`
Returns all downstream nodes impacted by a change to a specific symbol.

**Request body:**
```json
{
  "targetNodeId": "repo_id:sha:file_path",
  "commitSha": "abc123",
  "symbolName": "processPayment"
}
```

### `GET /api/story`
Generates an AI narrative walkthrough for traced graph paths. Uses Gemini API if configured; runs a local rule-based narrator otherwise.

**Query params:** `commitSha`, `repoId`

Full interactive documentation: **http://localhost:8000/docs**

---

## 🔒 Security

- **JWT verification** is enabled on all FastAPI endpoints. Every request must carry a `Authorization: Bearer <token>` header signed with `SUPABASE_JWT_SECRET`.
- **Tenant isolation**: All queries filter by the verified `owner` from the JWT claim. Cross-tenant access raises `403 Forbidden`.
- **Pydantic validation** enforces the API contract on every inbound payload.
- **Structured correlation IDs** (`X-Correlation-ID`) propagate from Next.js proxy to FastAPI for end-to-end request tracing.

> **⚠️ Dev placeholder**: The `'local'` org claim in the current Next.js proxy is a development placeholder. Full multi-tenant isolation requires integrating a real auth provider (Supabase Auth or Clerk) on the frontend.

---

## 🤝 Contributing

Contributions are welcome! Areas of particular interest:

- **Real auth provider integration** — wiring Supabase Auth or Clerk to replace the `'local'` dev placeholder
- **Codebase Q&A** — replacing the client-side regex simulation with a real pgvector semantic search
- **Additional language support** — extending the tree-sitter parser beyond TypeScript/JavaScript
- **Viem/ethers signer** — production wallet integration for any payment features
- **Performance** — async graph indexing (current implementation is synchronous, blocking the request)

### Development workflow

```bash
git clone https://github.com/dragon486/Branchdeck.git
cd Branchdeck

# Start the database
docker compose up db -d

# Backend
cd backend && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (new terminal)
cd webapp && npm install && npm run dev

# Tests
cd backend && pytest
cd webapp && npx tsc --noEmit
```

See [RUNBOOK.md](RUNBOOK.md) for the full operations guide and [ARCHITECTURE_AS_BUILT.md](ARCHITECTURE_AS_BUILT.md) for a verified deep-dive into the system design.

---

## 📄 License

MIT © [dragon486](https://github.com/dragon486)

---

<div align="center">

**Built to make large codebases human-scale.**

[GitHub](https://github.com/dragon486/Branchdeck) · [Issues](https://github.com/dragon486/Branchdeck/issues) · [VS Code Extension](extension/)

</div>
