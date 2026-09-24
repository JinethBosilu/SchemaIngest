# SchemaIngest

**A "gitingest-like" experience for databases.** Introspect your **PostgreSQL** or **MySQL / MariaDB** schema through a web UI — without credentials ever leaving your machine.

![Architecture](https://img.shields.io/badge/architecture-local--first-6366f1?style=flat-square)
![Python](https://img.shields.io/badge/agent-Python_3.10+-10b981?style=flat-square)
[![PyPI](https://img.shields.io/pypi/v/schemaingest?style=flat-square)](https://pypi.org/project/schemaingest/)
![React](https://img.shields.io/badge/web-React_+_TypeScript-06b6d4?style=flat-square)

## How It Works

```
┌─────────────────────────┐          ┌──────────────────────────┐
│   GitHub Pages Web UI   │◄──JSON──►│   Local Agent (Python)   │
│   (your browser)        │  localhost│   127.0.0.1:8420         │
│                         │  only    │                          │
│   No credentials here   │          │   Connects to your DB    │
└─────────────────────────┘          └─────────┬────────────────┘
                                               │
                                               ▼
                                     ┌──────────────────────┐
                                     │  PostgreSQL, MySQL   │
                                     │  or MariaDB          │
                                     └──────────────────────┘
```

**Security model:** The web UI (hosted on GitHub Pages) communicates only with the agent running on `localhost`. Your database credentials never leave your machine.

---

## Quick Start

### 1. Install the Agent

```bash
pipx install schemaingest    # recommended: isolated environment
# or
pip install schemaingest
```

Requires Python 3.10+.

### 2. Start the Agent

```bash
schemaingest agent
```

You'll see a **6-digit pairing code** in your terminal:

```
+---------------------------------------------------------+
|  SchemaIngest Agent v0.1.0                              |
|                                                         |
|  Pairing code:  482916                                  |
|  Enter this code in the web UI to connect.              |
|                                                         |
|  Agent:   http://127.0.0.1:8420                         |
|  Web UI:  https://jinethbosilu.github.io/SchemaIngest/  |
+---------------------------------------------------------+
```

### 3. Open the Web UI

Go to **https://jinethbosilu.github.io/SchemaIngest/**

1. Enter the **pairing code** from your terminal.
2. Pick **PostgreSQL** or **MySQL / MariaDB** and enter the connection details (sent only to localhost).
3. Browse your schema: tables, columns, keys and indexes, plus the **Diagram** tab.
4. Click **"Copy for AI"** to copy a token-efficient schema description.

Chrome and Edge ask whether the page may access your **local network**. Allow it: that
is the browser checking before a public site talks to the agent on `127.0.0.1`.

**"Your browser is blocking this page" / "Agent not found" while the agent is running:**
the permission was dismissed or blocked. Click the icon left of the address bar →
**Site settings** → set **Local network access** (in some versions **Apps on device**) to
**Allow**, then return to the tab; it connects by itself.

### 4. CLI-Only Export (Optional)

```bash
# Full schema pack as JSON
schemaingest pull --conn "postgresql://user:pass@localhost:5432/mydb" --out schema.json

# Compact text for pasting into an AI
schemaingest pull --conn "postgresql://user:pass@localhost:5432/mydb" --out schema.txt --format txt

# MySQL or MariaDB: the scheme picks the engine
schemaingest pull --conn "mysql://user:pass@localhost:3306/mydb" --out schema.txt --format txt
```

For PostgreSQL, `--schema` picks a schema other than `public`. In MySQL a database is a
schema, so the database in the connection string is the one introspected.

MySQL connection strings take one option, `ssl-mode`, with MySQL's values: `DISABLED`,
`PREFERRED` (the default), `REQUIRED` (encrypted), and `VERIFY_CA` / `VERIFY_IDENTITY`
(encrypted, certificate checked against the system's trusted CAs):
`mysql://user:pass@db.example.com/mydb?ssl-mode=VERIFY_IDENTITY`.

---

## Features

| Feature | Description |
|---------|-------------|
| **Databases** | PostgreSQL, MySQL 8 and MariaDB |
| **Schema Introspection** | Tables, columns, types, defaults, nullability |
| **Keys & Constraints** | Primary keys, foreign keys (composite included), unique, check constraints |
| **Inferred links** | For databases that declare no keys (MyISAM, many apps), links guessed from names like `user_id`, always marked as inferred |
| **Indexes** | Key columns (expressions and prefixes included), uniqueness |
| **Diagram: Table view** | The selected table in the middle, what references it on the left, what it references on the right, with the joining columns on every card |
| **Diagram: Graph view** | The same neighbourhood as a ring coloured by direction, plus the references among the neighbours |
| **Copy for AI** | One-click copy of compact, token-efficient schema text |
| **Pairing Security** | 6-digit code pairing, short-lived sessions |
| **Credential Safety** | Credentials go only to the local agent and are never stored in the browser |

In the diagram, click any neighbouring table to move to it. Browser back and forward
walk the trail, and hovering a card or circle spells out every column match.

### Declared and inferred relationships

Relationships come from the foreign keys the database declares. Many databases declare
none: MyISAM tables throw FOREIGN KEY clauses away, and plenty of applications only use
naming like `user_id`. So the agent also links a `<name>_id` column (or `<name>Id`) that no
declared key covers, when:
- a table is named after it (`users`, `categories`, and `shipping_address_id` finds
  `addresses`);
- that table has a single-column primary key;
- the two columns hold the same kind of value.

`parent_id` with no `parents` table points to its own table.

Inferred links are never shown as declared ones:
- they are dashed in the diagram;
- they read "inferred from column name" in the detail panel;
- Copy for AI lists them under `INFERRED RELATIONSHIPS`.

The diagram's **Inferred links** toggle hides them, and `schemaingest pull --no-infer`
leaves them out.

---

## Development Setup

### Agent (Python)

```bash
cd apps/agent
pip install -e ".[dev]"
schemaingest agent

# Tests. The integration tests run against real servers when these are set;
# SCHEMAINGEST_TEST_MYSQL_DSN takes a comma-separated list (MySQL, MariaDB, ...).
pytest
SCHEMAINGEST_TEST_DSN=postgresql://postgres:postgres@localhost:5432/postgres SCHEMAINGEST_TEST_MYSQL_DSN=mysql://root:root@127.0.0.1:3306/ pytest
```

### Web UI (React)

```bash
cd apps/web
npm install
npm run dev
# Open http://localhost:5173/SchemaIngest/
```

---

## Releasing the Agent to PyPI

Releases are published by `.github/workflows/publish.yml` using PyPI Trusted Publishing,
so no API token is stored in the repository.

**One-time setup:** on pypi.org, under *Your account → Publishing → Add a new pending
publisher*, enter project `schemaingest`, owner `JinethBosilu`, repository `SchemaIngest`,
workflow `publish.yml`, environment `pypi`. Then create a `pypi` environment in the
GitHub repository settings.

**Each release:**

1. Bump `__version__` in `apps/agent/schemaingest/__init__.py` and merge to `main`.
2. Tag the commit with the same version and push the tag:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

The workflow refuses to publish when the tag and `__version__` disagree.

---

## Monorepo Structure

```
SchemaIngest/
├── apps/
│   ├── agent/           # Python FastAPI agent (published to PyPI as "schemaingest")
│   └── web/             # React + Vite + TypeScript web UI, d3 diagram
├── packages/
│   └── schema-pack/     # Shared JSON Schema contract
├── .github/workflows/
│   ├── ci.yml           # Agent tests (Postgres, MySQL, MariaDB) and web build
│   ├── publish.yml      # PyPI release on a v* tag
│   └── web-deploy.yml   # GitHub Pages deployment
└── README.md
```

---

## Security

- Agent binds to **127.0.0.1 only**, never `0.0.0.0`.
- CORS allows only `https://jinethbosilu.github.io` and local development origins.
- Pairing code required before any session is granted.
- Database connections are opened **read-only**.
- Connection details are not stored in the browser; the schema is.
- Passwords are **redacted** from all logged/printed strings.
- Request bodies are **not logged**.
- Sessions expire after 4 hours.
- Rate limiting on all endpoints.

---

## License

MIT
