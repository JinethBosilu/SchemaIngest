"""Postgres schema introspection via information_schema + pg_catalog."""

from __future__ import annotations

from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

from schemaingest import __version__
from schemaingest.models import (
    ColumnInfo,
    ConstraintInfo,
    DbMeta,
    FkRef,
    IndexInfo,
    Relationship,
    SchemaPack,
    TableInfo,
)

# ─── SQL queries ──────────────────────────────────────────────────────

_TABLES_SQL = """
SELECT table_name
FROM information_schema.tables
WHERE table_schema = %s
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
"""

_COLUMNS_SQL = """
SELECT
    c.column_name,
    c.data_type,
    c.udt_name,
    c.is_nullable,
    c.column_default,
    c.character_maximum_length,
    c.numeric_precision
FROM information_schema.columns c
WHERE c.table_schema = %s AND c.table_name = %s
ORDER BY c.ordinal_position;
"""

_PK_SQL = """
SELECT kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = %s
    AND tc.table_name = %s
    AND tc.constraint_type = 'PRIMARY KEY'
ORDER BY kcu.ordinal_position;
"""

_FK_SQL = """
SELECT
    kcu.column_name       AS from_column,
    ccu.table_name        AS to_table,
    ccu.column_name       AS to_column,
    tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
    AND tc.table_schema = ccu.table_schema
WHERE tc.table_schema = %s
    AND tc.table_name = %s
    AND tc.constraint_type = 'FOREIGN KEY';
"""

_CONSTRAINTS_SQL = """
SELECT
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.check_constraints cc
    ON tc.constraint_name = cc.constraint_name
    AND tc.constraint_schema = cc.constraint_schema
WHERE tc.table_schema = %s
    AND tc.table_name = %s
ORDER BY tc.constraint_name, kcu.ordinal_position;
"""

_INDEXES_SQL = """
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = %s AND tablename = %s
ORDER BY indexname;
"""

_DB_VERSION_SQL = "SELECT version();"


# ─── Introspection logic ─────────────────────────────────────────────

def _column_type_display(row: dict) -> str:
    """Build a human-friendly type string."""
    udt = row["udt_name"]
    data_type = row["data_type"]
    max_len = row.get("character_maximum_length")

    # Use udt_name for user-defined / array types; otherwise data_type
    if data_type == "USER-DEFINED":
        return udt
    if data_type == "ARRAY":
        return f"{udt}[]"
    if max_len:
        return f"{data_type}({max_len})"
    return data_type


def _parse_index_unique(indexdef: str) -> bool:
    return "UNIQUE" in indexdef.upper().split("INDEX")[0] if "INDEX" in indexdef.upper() else False


def _parse_index_columns(indexdef: str) -> list[str]:
    """Extract column names from CREATE INDEX ... (col1, col2)."""
    start = indexdef.rfind("(")
    end = indexdef.rfind(")")
    if start == -1 or end == -1:
        return []
    inner = indexdef[start + 1:end]
    return [c.strip().split()[0] for c in inner.split(",")]


def introspect_postgres(dsn: str, schema: str = "public") -> SchemaPack:
    """Connect to Postgres and introspect the given schema.

    Args:
        dsn: Connection string (libpq format or URI).
        schema: Schema to introspect (default: "public").

    Returns:
        A populated SchemaPack model.
    """
    conn = psycopg2.connect(dsn)
    conn.set_session(readonly=True, autocommit=True)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # DB version
    cur.execute(_DB_VERSION_SQL)
    db_version = cur.fetchone()["version"]

    # Database name from connection
    db_name = conn.info.dbname

    # Tables
    cur.execute(_TABLES_SQL, (schema,))
    table_names = [r["table_name"] for r in cur.fetchall()]

    tables: list[TableInfo] = []
    all_relationships: list[Relationship] = []

    for tname in table_names:
        # Columns
        cur.execute(_COLUMNS_SQL, (schema, tname))
        raw_columns = cur.fetchall()

        # Primary keys
        cur.execute(_PK_SQL, (schema, tname))
        pk_cols = {r["column_name"] for r in cur.fetchall()}

        # Foreign keys
        cur.execute(_FK_SQL, (schema, tname))
        fk_rows = cur.fetchall()
        fk_map: dict[str, FkRef] = {}
        for fk in fk_rows:
            fk_map[fk["from_column"]] = FkRef(table=fk["to_table"], column=fk["to_column"])
            all_relationships.append(
                Relationship(
                    fromTable=tname,
                    fromColumn=fk["from_column"],
                    toTable=fk["to_table"],
                    toColumn=fk["to_column"],
                    constraintName=fk["constraint_name"],
                )
            )

        columns = []
        for rc in raw_columns:
            col_name = rc["column_name"]
            columns.append(
                ColumnInfo(
                    name=col_name,
                    type=_column_type_display(rc),
                    nullable=rc["is_nullable"] == "YES",
                    default=rc["column_default"],
                    isPrimaryKey=col_name in pk_cols,
                    isForeignKey=col_name in fk_map,
                    fkRef=fk_map.get(col_name),
                )
            )

        # Constraints
        cur.execute(_CONSTRAINTS_SQL, (schema, tname))
        raw_constraints = cur.fetchall()
        constraint_map: dict[str, ConstraintInfo] = {}
        for rc in raw_constraints:
            cname = rc["constraint_name"]
            if cname not in constraint_map:
                constraint_map[cname] = ConstraintInfo(
                    name=cname,
                    type=rc["constraint_type"],
                    columns=[],
                    definition=rc.get("check_clause"),
                )
            if rc.get("column_name") and rc["column_name"] not in constraint_map[cname].columns:
                constraint_map[cname].columns.append(rc["column_name"])

        # Indexes
        cur.execute(_INDEXES_SQL, (schema, tname))
        indexes = []
        for ix in cur.fetchall():
            indexes.append(
                IndexInfo(
                    name=ix["indexname"],
                    columns=_parse_index_columns(ix["indexdef"]),
                    isUnique=_parse_index_unique(ix["indexdef"]),
                )
            )

        tables.append(
            TableInfo(
                name=tname,
                schema=schema,
                columns=columns,
                primaryKey=list(pk_cols),
                indexes=indexes,
                constraints=list(constraint_map.values()),
            )
        )

    cur.close()
    conn.close()

    meta = DbMeta(
        dbName=db_name,
        dbVersion=db_version,
        schema=schema,
        generatedAt=datetime.now(timezone.utc).isoformat(),
        agentVersion=__version__,
    )

    return SchemaPack(meta=meta, tables=tables, relationships=all_relationships)
