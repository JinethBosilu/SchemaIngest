"""Introspection against a real Postgres.

Skipped unless SCHEMAINGEST_TEST_DSN points at a database the test may create
and drop a schema in. CI provides one; locally, e.g.
    SCHEMAINGEST_TEST_DSN=postgresql://postgres:postgres@localhost:5432/postgres
"""

from __future__ import annotations

import os

import pytest

DSN = os.environ.get("SCHEMAINGEST_TEST_DSN")
pytestmark = pytest.mark.skipif(not DSN, reason="SCHEMAINGEST_TEST_DSN not set")

SCHEMA = "schemaingest_test"

FIXTURE_SQL = f"""
DROP SCHEMA IF EXISTS {SCHEMA} CASCADE;
CREATE SCHEMA {SCHEMA};
SET search_path = {SCHEMA};

CREATE TABLE regions (code text PRIMARY KEY);

-- Multi-column primary key, declared in a different order to the columns.
CREATE TABLE orders (
    id      integer NOT NULL,
    region  text    NOT NULL REFERENCES regions(code),
    tags    text[],
    total   numeric CHECK (total >= 0),
    PRIMARY KEY (region, id)
);

-- Composite foreign key.
CREATE TABLE order_lines (
    line_id      integer PRIMARY KEY,
    order_region text    NOT NULL,
    order_id     integer NOT NULL,
    sku          text    NOT NULL,
    CONSTRAINT order_lines_order_fkey FOREIGN KEY (order_region, order_id)
        REFERENCES orders (region, id),
    CONSTRAINT order_lines_sku_key UNIQUE (sku)
);

-- Partial index and expression index.
CREATE INDEX order_lines_open_idx ON order_lines (order_id) WHERE sku <> '';
CREATE INDEX order_lines_sku_lower_idx ON order_lines (lower(sku));

-- No declared keys. warehouse_id names a table with a one-column key, so it
-- is inferred; order_id names orders, whose key has two columns, so it is not.
CREATE TABLE warehouses (id integer PRIMARY KEY);
CREATE TABLE shipments (
    id           integer PRIMARY KEY,
    warehouse_id integer,
    order_id     integer
);

-- Self reference.
CREATE TABLE categories (
    id        integer PRIMARY KEY,
    parent_id integer REFERENCES categories(id)
);

-- Partitioned table: one partition is itself partitioned. Only the parent
-- belongs in the pack.
CREATE TABLE events (
    id         integer NOT NULL,
    created_at date    NOT NULL,
    kind       text    NOT NULL,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE TABLE events_2026_01 PARTITION OF events
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE events_2026_02 PARTITION OF events
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01') PARTITION BY RANGE (created_at);
CREATE TABLE events_2026_02_a PARTITION OF events_2026_02
    FOR VALUES FROM ('2026-02-01') TO ('2026-02-15');

-- A foreign key into a partitioned table: Postgres also stores a constraint
-- per partition on this table, each pointing at that partition.
CREATE TABLE event_notes (
    id            integer PRIMARY KEY,
    event_id      integer NOT NULL,
    event_created date    NOT NULL,
    CONSTRAINT event_notes_event_fkey FOREIGN KEY (event_id, event_created)
        REFERENCES events (id, created_at)
);
"""


@pytest.fixture(scope="module")
def pack():
    import psycopg2

    from schemaingest.introspect import introspect
    from schemaingest.models import ConnectRequest

    conn = psycopg2.connect(DSN)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(FIXTURE_SQL)
    try:
        yield introspect(ConnectRequest(connectionString=DSN, schema=SCHEMA))
    finally:
        with conn.cursor() as cur:
            cur.execute(f"DROP SCHEMA IF EXISTS {SCHEMA} CASCADE")
        conn.close()


def _table(pack, name):
    return next(t for t in pack.tables if t.name == name)


def test_lists_tables(pack):
    assert [t.name for t in pack.tables] == [
        "categories", "event_notes", "events", "order_lines", "orders", "regions",
        "shipments", "warehouses",
    ]
    assert pack.meta.schema_ == SCHEMA
    assert pack.meta.engine == "postgresql"
    assert pack.meta.dbVersion.startswith("PostgreSQL ")


def test_primary_key_keeps_declared_order(pack):
    orders = _table(pack, "orders")
    assert orders.primaryKey == ["region", "id"]
    assert {c.name for c in orders.columns if c.isPrimaryKey} == {"region", "id"}


def test_composite_fk_pairs_columns_without_cross_product(pack):
    rels = [r for r in pack.relationships if r.constraintName == "order_lines_order_fkey"]
    assert [(r.fromColumn, r.toTable, r.toColumn) for r in rels] == [
        ("order_region", "orders", "region"),
        ("order_id", "orders", "id"),
    ]
    lines = _table(pack, "order_lines")
    fk = {c.name: c.fkRef for c in lines.columns if c.isForeignKey}
    assert fk["order_region"].column == "region"
    assert fk["order_id"].column == "id"


def test_self_reference(pack):
    rels = [r for r in pack.relationships if r.fromTable == "categories" and not r.inferred]
    assert [(r.fromColumn, r.toTable, r.toColumn) for r in rels] == [("parent_id", "categories", "id")]


def test_indexes(pack):
    idx = {i.name: i for i in _table(pack, "order_lines").indexes}
    assert idx["order_lines_open_idx"].columns == ["order_id"]
    assert idx["order_lines_open_idx"].isUnique is False
    assert idx["order_lines_sku_lower_idx"].columns == ["lower(sku)"]
    assert idx["order_lines_sku_key"].isUnique is True
    assert _table(pack, "orders").indexes[0].columns == ["region", "id"]


def test_constraints_exclude_not_null_noise(pack):
    cons = {c.name: c for c in _table(pack, "orders").constraints}
    assert set(c.type for c in cons.values()) == {"PRIMARY KEY", "FOREIGN KEY", "CHECK"}
    check = next(c for c in cons.values() if c.type == "CHECK")
    assert check.columns == ["total"]
    assert "total >= 0" in check.definition
    uniq = {c.name: c for c in _table(pack, "order_lines").constraints}["order_lines_sku_key"]
    assert uniq.type == "UNIQUE" and uniq.columns == ["sku"]


def test_array_column_type(pack):
    tags = next(c for c in _table(pack, "orders").columns if c.name == "tags")
    assert tags.type == "text[]"


def test_undeclared_links_are_inferred_and_marked(pack):
    inferred = [(r.fromTable, r.fromColumn, r.toTable, r.toColumn) for r in pack.relationships if r.inferred]
    assert inferred == [("shipments", "warehouse_id", "warehouses", "id")]
    # Declared keys are never repeated as inferred ones.
    assert not any(r.inferred for r in pack.relationships if r.fromTable in ("order_lines", "categories"))


def test_partitioned_table_is_its_parent(pack):
    events = _table(pack, "events")
    assert [c.name for c in events.columns] == ["id", "created_at", "kind"]
    assert events.primaryKey == ["id", "created_at"]
    assert [i.columns for i in events.indexes] == [["id", "created_at"]]


def test_fk_into_partitioned_table_targets_the_parent_once(pack):
    rels = [r for r in pack.relationships if r.fromTable == "event_notes"]
    assert [(r.fromColumn, r.toTable, r.toColumn, r.constraintName) for r in rels] == [
        ("event_id", "events", "id", "event_notes_event_fkey"),
        ("event_created", "events", "created_at", "event_notes_event_fkey"),
    ]
    fks = [c.name for c in _table(pack, "event_notes").constraints if c.type == "FOREIGN KEY"]
    assert fks == ["event_notes_event_fkey"]


def test_no_relationship_mentions_a_partition(pack):
    names = {n for r in pack.relationships for n in (r.fromTable, r.toTable)}
    assert not any(n.startswith("events_") for n in names)
