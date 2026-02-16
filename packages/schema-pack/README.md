# Schema Pack Contract

This directory contains the **Schema Pack** — the shared data contract between the SchemaIngest agent and web UI.

## Files

- `schema-pack.schema.json` — JSON Schema (draft-07) defining the structure.

## Overview

A Schema Pack contains:

| Section | Description |
|---------|-------------|
| `meta` | Database name, version, schema name, generation timestamp, agent version |
| `tables[]` | Table name, columns (type, nullable, default, PK/FK flags), primary key, indexes, constraints |
| `relationships[]` | Foreign key relationships: fromTable.fromColumn → toTable.toColumn |

Both the Python agent (Pydantic models) and the web UI (TypeScript interfaces) mirror this schema.
