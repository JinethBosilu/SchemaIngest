# SchemaIngest

**A "gitingest"-style tool for databases.** Browse your PostgreSQL, MySQL or MariaDB schema in a web UI (tables,
columns, keys, indexes and an interactive relationship diagram), and copy a compact,
token-efficient description of it for an AI. Your credentials never leave your machine.

This package is the **local agent**. It runs on `127.0.0.1`, connects to your database
read-only, and serves the schema to the web UI at
<https://jinethbosilu.github.io/SchemaIngest/>.

## Install

```bash
pipx install schemaingest      # or: pip install schemaingest
```

Requires Python 3.10+.

## Use it with the web UI

```bash
schemaingest agent
```

The terminal shows a 6-digit **pairing code**. Open
<https://jinethbosilu.github.io/SchemaIngest/>, enter the code, then pick your database engine
and enter its connection details. They go only to the agent on `localhost`.

Chrome asks whether the page may access your local network. Allow it: that is the browser
checking before a public site talks to the agent on `127.0.0.1`. If you dismissed it, the
page says the browser is blocking it: click the icon left of the address bar → **Site
settings** → **Local network access** → **Allow**.

## Relationships

Relationships come from declared foreign keys. For databases that declare none (MyISAM
tables, or apps that only use names like `user_id`), the agent also infers links from
column names: `<name>_id` to a table named after it with a single-column key of the same
kind. Inferred links are always marked as inferred, and `pull --no-infer` leaves them out.

## Use it without the web UI

```bash
# Full schema pack as JSON
schemaingest pull --conn "postgresql://user:pass@localhost:5432/mydb" --out schema.json

# Compact text, ready to paste into an AI
schemaingest pull --conn "postgresql://user:pass@localhost:5432/mydb" --out schema.txt --format txt

# MySQL or MariaDB: the scheme picks the engine
schemaingest pull --conn "mysql://user:pass@localhost:3306/mydb" --out schema.txt --format txt
```

For PostgreSQL, `--schema` picks a schema other than `public`. In MySQL a database is a
schema, so the database in the connection string is the one introspected. MySQL
connection strings accept `?ssl-mode=` with MySQL's values (`DISABLED`, `PREFERRED`,
`REQUIRED`, `VERIFY_CA`, `VERIFY_IDENTITY`).

## Security

- Binds to `127.0.0.1` only.
- CORS allows only the GitHub Pages UI and local development origins.
- A pairing code is required before any session is issued; sessions expire after 4 hours.
- Connections are opened read-only.
- Passwords are redacted from every printed error, and request bodies are never logged.

## License

MIT
