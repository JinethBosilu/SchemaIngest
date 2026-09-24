"""MySQL and MariaDB introspection via information_schema.

information_schema is slow on MySQL - each view is materialised from the data
dictionary on every read - so every view is read once for the whole database
and grouped by table here, rather than queried table by table."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

import pymysql
import pymysql.cursors

from schemaingest.introspect.common import RawColumn, RawForeignKey, build_table, make_meta
from schemaingest.models import ConstraintInfo, IndexInfo, Relationship, SchemaPack, TableInfo

# ─── SQL queries ──────────────────────────────────────────────────────
# Every column is aliased: MySQL 8 returns information_schema names in
# upper case, MariaDB as written.

_TABLES_SQL = """
SELECT TABLE_NAME AS table_name
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;
"""

_COLUMNS_SQL = """
SELECT
    TABLE_NAME     AS table_name,
    COLUMN_NAME    AS column_name,
    COLUMN_TYPE    AS column_type,
    IS_NULLABLE    AS is_nullable,
    COLUMN_DEFAULT AS column_default,
    EXTRA          AS extra
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = %s
ORDER BY TABLE_NAME, ORDINAL_POSITION;
"""

# Key columns of every PRIMARY KEY, UNIQUE and FOREIGN KEY constraint, in key
# order. A foreign key's rows pair up column by column, so a composite key
# comes out as one row per column pair.
_KEY_COLUMNS_SQL = """
SELECT
    TABLE_NAME             AS table_name,
    CONSTRAINT_NAME        AS constraint_name,
    COLUMN_NAME            AS column_name,
    REFERENCED_TABLE_NAME  AS to_table,
    REFERENCED_COLUMN_NAME AS to_column
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = %s
ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION;
"""

_TABLE_CONSTRAINTS_SQL = """
SELECT
    TABLE_NAME      AS table_name,
    CONSTRAINT_NAME AS constraint_name,
    CONSTRAINT_TYPE AS constraint_type
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = %s AND CONSTRAINT_TYPE IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')
ORDER BY TABLE_NAME, CONSTRAINT_NAME;
"""

# MariaDB names a check per table and says which table in CHECK_CONSTRAINTS;
# MySQL names it per database, and the table comes from TABLE_CONSTRAINTS.
_CHECKS_MARIADB_SQL = """
SELECT
    TABLE_NAME      AS table_name,
    CONSTRAINT_NAME AS constraint_name,
    CHECK_CLAUSE    AS definition
FROM information_schema.CHECK_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = %s
ORDER BY TABLE_NAME, CONSTRAINT_NAME;
"""

_CHECKS_MYSQL_SQL = """
SELECT
    tc.TABLE_NAME      AS table_name,
    tc.CONSTRAINT_NAME AS constraint_name,
    cc.CHECK_CLAUSE    AS definition
FROM information_schema.TABLE_CONSTRAINTS tc
JOIN information_schema.CHECK_CONSTRAINTS cc
  ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
WHERE tc.TABLE_SCHEMA = %s AND tc.CONSTRAINT_TYPE = 'CHECK'
ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_NAME;
"""

_INDEXES_SQL = """
SELECT
    TABLE_NAME   AS table_name,
    INDEX_NAME   AS index_name,
    NON_UNIQUE   AS non_unique,
    COLUMN_NAME  AS column_name,
    SUB_PART     AS sub_part,
    {expression} AS expression
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = %s
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;
"""

# Which optional information_schema columns this server has: CHECK_CONSTRAINTS
# arrived in MySQL 8.0.16 and MariaDB 10.2, STATISTICS.EXPRESSION (functional
# indexes) in MySQL 8.0.13, and MariaDB has none.
_FEATURES_SQL = """
SELECT UPPER(TABLE_NAME) AS table_name, UPPER(COLUMN_NAME) AS column_name
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'information_schema'
  AND UPPER(TABLE_NAME) IN ('CHECK_CONSTRAINTS', 'STATISTICS');
"""


# ─── Introspection logic ─────────────────────────────────────────────

def _text(value: Any) -> Any:
    """MySQL 8 hands some information_schema columns back as bytes."""
    return value.decode("utf-8") if isinstance(value, (bytes, bytearray)) else value


def _rows(cur, sql: str, schema: str) -> list[dict]:
    cur.execute(sql, (schema,))
    return [{k: _text(v) for k, v in row.items()} for row in cur.fetchall()]


def _server_version(raw: str) -> tuple[str, bool]:
    """"10.4.32-MariaDB-log" -> ("MariaDB 10.4.32", True); "8.4.2" -> ("MySQL 8.4.2", False)."""
    is_mariadb = "mariadb" in raw.lower()
    return f"{'MariaDB' if is_mariadb else 'MySQL'} {raw.split('-')[0]}", is_mariadb


def _column_default(row: dict, is_mariadb: bool) -> str | None:
    if "auto_increment" in (row["extra"] or "").lower():
        return "auto_increment"
    default = row["column_default"]
    # MariaDB reports "no default" on a nullable column as the text NULL, and
    # quotes real string defaults, so the bare word is never a literal there.
    if is_mariadb and default == "NULL":
        return None
    return None if default is None else str(default)


def introspect_mysql(params: dict[str, Any], schema: str) -> SchemaPack:
    """Connect to MySQL or MariaDB and introspect one database.

    Args:
        params: Keyword arguments for pymysql.connect (see ConnectRequest.to_mysql_params).
        schema: The database to introspect - in MySQL a database is a schema.
    """
    conn = pymysql.connect(
        **params,
        charset="utf8mb4",
        connect_timeout=10,
        autocommit=True,
        cursorclass=pymysql.cursors.DictCursor,
    )
    try:
        with conn.cursor() as cur:
            cur.execute("SET SESSION TRANSACTION READ ONLY")
            cur.execute("SELECT VERSION() AS version")
            db_version, is_mariadb = _server_version(_text(cur.fetchone()["version"]))

            cur.execute(_FEATURES_SQL)
            features = {(_text(r["table_name"]), _text(r["column_name"])) for r in cur.fetchall()}
            has_checks = any(t == "CHECK_CONSTRAINTS" for t, _ in features)
            has_expressions = ("STATISTICS", "EXPRESSION") in features

            # Sorted here: ORDER BY follows the server's collation, which puts
            # "orders" before "order_lines" on some servers and not others.
            table_names = sorted(r["table_name"] for r in _rows(cur, _TABLES_SQL, schema))
            columns = _rows(cur, _COLUMNS_SQL, schema)
            key_columns = _rows(cur, _KEY_COLUMNS_SQL, schema)
            table_constraints = _rows(cur, _TABLE_CONSTRAINTS_SQL, schema)
            checks = []
            if has_checks:
                has_table_name = ("CHECK_CONSTRAINTS", "TABLE_NAME") in features
                checks = _rows(cur, _CHECKS_MARIADB_SQL if has_table_name else _CHECKS_MYSQL_SQL, schema)
            index_rows = _rows(
                cur,
                _INDEXES_SQL.format(expression="EXPRESSION" if has_expressions else "NULL"),
                schema,
            )
    finally:
        conn.close()

    by_table: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))

    for c in columns:
        by_table[c["table_name"]]["columns"].append(RawColumn(
            name=c["column_name"],
            type=c["column_type"],
            nullable=c["is_nullable"] == "YES",
            default=_column_default(c, is_mariadb),
        ))

    # Constraint columns, in key order, and the foreign keys among them.
    constraint_cols: dict[tuple[str, str], list[str]] = defaultdict(list)
    for k in key_columns:
        constraint_cols[(k["table_name"], k["constraint_name"])].append(k["column_name"])
        if k["to_table"] is not None:
            by_table[k["table_name"]]["fks"].append(RawForeignKey(
                from_column=k["column_name"],
                to_table=k["to_table"],
                to_column=k["to_column"],
                constraint_name=k["constraint_name"],
            ))

    constraints: list[tuple[str, ConstraintInfo]] = [
        (tc["table_name"], ConstraintInfo(
            name=tc["constraint_name"],
            type=tc["constraint_type"],
            columns=constraint_cols[(tc["table_name"], tc["constraint_name"])],
        ))
        for tc in table_constraints
    ]
    # MySQL does not say which columns a check reads.
    constraints += [
        (ck["table_name"], ConstraintInfo(
            name=ck["constraint_name"], type="CHECK", columns=[], definition=ck["definition"],
        ))
        for ck in checks
    ]
    for tname, con in sorted(constraints, key=lambda tc: (tc[0], tc[1].name)):
        by_table[tname]["constraints"].append(con)

    indexes: dict[tuple[str, str], IndexInfo] = {}
    for ix in index_rows:
        key = (ix["table_name"], ix["index_name"])
        if key not in indexes:
            indexes[key] = IndexInfo(name=ix["index_name"], columns=[], isUnique=int(ix["non_unique"]) == 0)
            by_table[ix["table_name"]]["indexes"].append(indexes[key])
        if ix["column_name"] is None:
            part = ix["expression"] or "?"  # a functional index on a server we could not read
        elif ix["sub_part"] is not None:
            part = f"{ix['column_name']}({ix['sub_part']})"  # a prefix index
        else:
            part = ix["column_name"]
        indexes[key].columns.append(part)
        if ix["index_name"] == "PRIMARY":
            by_table[ix["table_name"]]["pk"].append(ix["column_name"])

    tables: list[TableInfo] = []
    all_relationships: list[Relationship] = []
    for tname in table_names:
        t = by_table[tname]
        table, relationships = build_table(
            tname, schema, t["columns"], t["pk"], t["fks"], t["constraints"], t["indexes"],
        )
        tables.append(table)
        all_relationships.extend(relationships)

    meta = make_meta("mysql", schema, db_version, schema)
    return SchemaPack(meta=meta, tables=tables, relationships=all_relationships)
