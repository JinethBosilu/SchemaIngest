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

# Keys, constraints and indexes come from pg_catalog rather than
# information_schema: constraint_column_usage only shows columns of tables the
# current role owns, and it cannot pair up the columns of a composite key.

_PK_SQL = """
SELECT a.attname AS column_name
FROM pg_constraint con
JOIN pg_class t ON t.oid = con.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
WHERE n.nspname = %s AND t.relname = %s AND con.contype = 'p'
ORDER BY k.ord;
"""

_FK_SQL = """
SELECT
    a.attname   AS from_column,
    ft.relname  AS to_table,
    fa.attname  AS to_column,
    con.conname AS constraint_name
FROM pg_constraint con
JOIN pg_class t ON t.oid = con.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
JOIN pg_class ft ON ft.oid = con.confrelid
CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(attnum, fattnum, ord)
JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
JOIN pg_attribute fa ON fa.attrelid = con.confrelid AND fa.attnum = k.fattnum
WHERE n.nspname = %s AND t.relname = %s AND con.contype = 'f'
ORDER BY con.conname, k.ord;
"""

# NOT NULL is reported per column, so only real constraints are listed here.
_CONSTRAINTS_SQL = """
SELECT
    con.conname AS constraint_name,
    CASE con.contype
        WHEN 'p' THEN 'PRIMARY KEY'
        WHEN 'f' THEN 'FOREIGN KEY'
        WHEN 'u' THEN 'UNIQUE'
        WHEN 'c' THEN 'CHECK'
    END AS constraint_type,
    COALESCE(
        ARRAY(
            SELECT a.attname::text
            FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
            ORDER BY k.ord
        ),
        ARRAY[]::text[]
    ) AS columns,
    CASE WHEN con.contype = 'c' THEN pg_get_constraintdef(con.oid, true) END AS definition
FROM pg_constraint con
JOIN pg_class t ON t.oid = con.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = %s AND t.relname = %s AND con.contype IN ('p', 'f', 'u', 'c')
ORDER BY con.conname;
"""

# One entry per key column, as Postgres itself prints it - a plain column name,
# or the expression for an expression index. INCLUDE columns and a partial
# index's WHERE clause are not key columns and are left out.
_INDEXES_SQL = """
SELECT
    i.relname AS indexname,
    ix.indisunique AS is_unique,
    ARRAY(
        SELECT pg_get_indexdef(ix.indexrelid, g, true)
        FROM generate_series(1, ix.indnkeyatts) AS g
        ORDER BY g
    ) AS columns
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = %s AND t.relname = %s
ORDER BY i.relname;
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
        # The udt of an array is the element type with a leading underscore.
        return f"{udt[1:] if udt.startswith('_') else udt}[]"
    if max_len:
        return f"{data_type}({max_len})"
    return data_type


def _introspect_table(cur, schema: str, tname: str) -> tuple[TableInfo, list[Relationship]]:
    cur.execute(_COLUMNS_SQL, (schema, tname))
    raw_columns = cur.fetchall()

    cur.execute(_PK_SQL, (schema, tname))
    pk_cols = [r["column_name"] for r in cur.fetchall()]

    cur.execute(_FK_SQL, (schema, tname))
    relationships: list[Relationship] = []
    fk_map: dict[str, FkRef] = {}
    for fk in cur.fetchall():
        # A column in two foreign keys keeps its first target for fkRef; every
        # pairing is still listed in relationships.
        fk_map.setdefault(fk["from_column"], FkRef(table=fk["to_table"], column=fk["to_column"]))
        relationships.append(
            Relationship(
                fromTable=tname,
                fromColumn=fk["from_column"],
                toTable=fk["to_table"],
                toColumn=fk["to_column"],
                constraintName=fk["constraint_name"],
            )
        )

    columns = [
        ColumnInfo(
            name=rc["column_name"],
            type=_column_type_display(rc),
            nullable=rc["is_nullable"] == "YES",
            default=rc["column_default"],
            isPrimaryKey=rc["column_name"] in pk_cols,
            isForeignKey=rc["column_name"] in fk_map,
            fkRef=fk_map.get(rc["column_name"]),
        )
        for rc in raw_columns
    ]

    cur.execute(_CONSTRAINTS_SQL, (schema, tname))
    constraints = [
        ConstraintInfo(
            name=rc["constraint_name"],
            type=rc["constraint_type"],
            columns=list(rc["columns"]),
            definition=rc["definition"],
        )
        for rc in cur.fetchall()
    ]

    cur.execute(_INDEXES_SQL, (schema, tname))
    indexes = [
        IndexInfo(name=ix["indexname"], columns=list(ix["columns"]), isUnique=ix["is_unique"])
        for ix in cur.fetchall()
    ]

    table = TableInfo(
        name=tname,
        schema=schema,
        columns=columns,
        primaryKey=pk_cols,
        indexes=indexes,
        constraints=constraints,
    )
    return table, relationships


def introspect_postgres(dsn: str, schema: str = "public") -> SchemaPack:
    """Connect to Postgres and introspect the given schema.

    Args:
        dsn: Connection string (libpq format or URI).
        schema: Schema to introspect (default: "public").

    Returns:
        A populated SchemaPack model.
    """
    conn = psycopg2.connect(dsn)
    try:
        conn.set_session(readonly=True, autocommit=True)
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(_DB_VERSION_SQL)
            db_version = cur.fetchone()["version"]
            db_name = conn.info.dbname

            cur.execute(_TABLES_SQL, (schema,))
            table_names = [r["table_name"] for r in cur.fetchall()]

            tables: list[TableInfo] = []
            all_relationships: list[Relationship] = []
            for tname in table_names:
                table, relationships = _introspect_table(cur, schema, tname)
                tables.append(table)
                all_relationships.extend(relationships)
    finally:
        conn.close()

    meta = DbMeta(
        dbName=db_name,
        dbVersion=db_version,
        schema=schema,
        generatedAt=datetime.now(timezone.utc).isoformat(),
        agentVersion=__version__,
    )

    return SchemaPack(meta=meta, tables=tables, relationships=all_relationships)
