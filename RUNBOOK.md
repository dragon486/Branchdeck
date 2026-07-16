# Branchdeck — Operations & Setup Runbook

This guide details the steps to set up and run Branchdeck locally for development and testing.

## Prerequisites

- **Python**: version `3.12` or higher.
- **Node.js**: version `18` or higher (with `npm`).
- **Git**: installed and configured.

---

## 1. Backend Service (FastAPI)

The backend engine parses repository files, builds AST representations, and manages graph database transactions.

### Setup
1. Open a terminal in the `backend/` directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   - **Windows (PowerShell)**:
     ```powershell
     python -m venv venv
     .\venv\Scripts\Activate.ps1
     ```
   - **macOS / Linux**:
     ```bash
     python -m venv venv
     source venv/bin/activate
     ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Configuration
Configure behavior using the following environment variables:

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string. | `postgresql://postgres:postgres@localhost:5432/postgres` |
| `GEMINI_API_KEY` | API Key for AI Story Mode generation. | *Optional (Falls back to local rules narrator)* |

> [!IMPORTANT]
> **Database fail-fast**: To maintain environment parity and consistency guarantees, the backend will fail fast and crash on startup if PostgreSQL is configured (by passing `postgresql` in `DATABASE_URL`) but unreachable. Silent substitution of SQLite is disabled.

### Run FastAPI Server
Start the development server with live reload:
```bash
uvicorn main:app --reload --port 8000
```
The interactive API documentation is available at `http://localhost:8000/docs`.

---

## 2. Frontend Application (Next.js)

The web frontend visualizes codebase dependency structures, call flows, impact analyses, and AI workflow stories.

### Setup
1. Open a terminal in the `webapp/` directory:
   ```bash
   cd webapp
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```

### Run Next.js App
Start the local development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. Next.js routes automatically proxy backend graph calls to the FastAPI engine on port `8000`.

---

## 3. Running Verification Tests

Branchdeck includes a full automated test suite verifying codebase parsing and security boundaries.

### Python Backend Tests
Run the test runner inside the active backend virtual environment:
```bash
cd backend
pytest
```
*Note: These tests run against an isolated PostgreSQL container via `testcontainers-postgres` (requires Docker to be active) or a running PostgreSQL server specified by `DATABASE_URL`/`TEST_DATABASE_URL` (no silent SQLite fallback).*

### TypeScript Frontend Checks
Verify code compilation and type safety:
```bash
cd webapp
npx tsc --noEmit
```
