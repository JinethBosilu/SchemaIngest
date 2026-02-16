# SchemaIngest

**A "gitingest-like" experience for databases.** Introspect your Postgres schema through a beautiful web UI — without credentials ever leaving your machine.

![Architecture](https://img.shields.io/badge/architecture-local--first-6366f1?style=flat-square)
![Python](https://img.shields.io/badge/agent-Python_3.11+-10b981?style=flat-square)
![React](https://img.shields.io/badge/web-React_+_TypeScript-06b6d4?style=flat-square)

## How It Works

```
┌─────────────────────────┐          ┌──────────────────────────┐
│   GitHub Pages Web UI   │◄──JSON──►│   Local Agent (Python)   │
│   (your browser)        │  localhost│   127.0.0.1:8420         │
│                         │  only    │                          │
│   No credentials here   │          │   Connects to Postgres   │
└─────────────────────────┘          └─────────┬────────────────┘
                                               │
                                               ▼
                                     ┌──────────────────┐
                                     │   Your Postgres   │
                                     │   Database        │
                                     └──────────────────┘
```

**Security model:** The web UI (hosted on GitHub Pages) communicates only with the agent running on `localhost`. Your database credentials never leave your machine.

---

## Quick Start

### 1. Install the Agent

```bash
# Option A: pipx (recommended, isolated environment)
pipx install "git+https://github.com/JinethBosilu/SchemaIngest.git#subdirectory=apps/agent"

# Option B: pip
pip install "git+https://github.com/JinethBosilu/SchemaIngest.git#subdirectory=apps/agent"
```

### 2. Start the Agent

```bash
schemaingest agent
```

You'll see a **6-digit pairing code** in your terminal:

```
╔══════════════════════════════════════════════════════════╗
║              SchemaIngest Agent v0.1.0                   ║
╠══════════════════════════════════════════════════════════╣
║   🔑 Pairing Code:  482916                              ║
║   🌐 Agent:  http://127.0.0.1:8420                      ║
║   🖥  Web UI: https://jinethbosilu.github.io/SchemaIngest/║
╚══════════════════════════════════════════════════════════╝
```

### 3. Open the Web UI

Go to **https://jinethbosilu.github.io/SchemaIngest/**

1. Enter the **pairing code** from your terminal.
2. Enter your **Postgres connection** details (sent only to localhost).
3. Browse your schema — tables, columns, indexes, ERD diagram.
4. Click **"Copy for AI"** to copy a token-efficient schema description.

### 4. CLI-Only Export (Optional)

```bash
schemaingest pull --conn "postgresql://user:pass@localhost:5432/mydb" --out schema.json
```

---

## Features

| Feature | Description |
|---------|-------------|
| **Schema Introspection** | Tables, columns, types, defaults, nullability |
| **Keys & Constraints** | Primary keys, foreign keys, unique, check constraints |
| **Relationships** | FK relationship mapping between tables |
| **Indexes** | Index names, columns, uniqueness |
| **Mermaid ERD** | Auto-generated ER diagram with dark theme |
| **Copy for AI** | One-click copy of compact, token-efficient schema text |
| **Pairing Security** | 6-digit code pairing, short-lived sessions |
| **Credential Safety** | Credentials never leave localhost |

---

## Development Setup

### Agent (Python)

```bash
cd apps/agent
pip install -e .
schemaingest agent
```

### Web UI (React)

```bash
cd apps/web
npm install
npm run dev
# Open http://localhost:5173/SchemaIngest/
```

---

## Monorepo Structure

```
SchemaIngest/
├── apps/
│   ├── agent/           # Python FastAPI agent (pip/pipx installable)
│   └── web/             # React + Vite + TypeScript web UI
├── packages/
│   └── schema-pack/     # Shared JSON Schema contract
├── .github/workflows/
│   └── web-deploy.yml   # GitHub Pages deployment
└── README.md
```

---

## Security

- Agent binds to **127.0.0.1 only** — never `0.0.0.0`.
- CORS allows only `https://jinethbosilu.github.io` and `http://localhost:5173`.
- Pairing code required before any session is granted.
- Passwords are **redacted** from all logged/printed strings.
- Request bodies are **not logged**.
- Sessions expire after 4 hours.
- Rate limiting on all endpoints.

---

## License

MIT
