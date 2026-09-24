"""Introspection against a real MySQL or MariaDB.

Skipped unless SCHEMAINGEST_TEST_MYSQL_DSN points at a server the test may
create and drop a database on. Several servers can be listed, comma-separated,
and every test runs against each. CI provides MySQL and MariaDB; locally, e.g.
    SCHEMAINGEST_TEST_MYSQL_DSN=mysql://root:root@127.0.0.1:3306/
"""

from __future__ import annotations

import os

import pytest

DSNS = [d.strip() for d in os.environ.get("SCHEMAINGEST_TEST_MYSQL_DSN", "").split(",") if d.strip()]
pytestmark = pytest.mark.skipif(not DSNS, reason="SCHEMAINGEST_TEST_MYSQL_DSN not set")

DB = "schemaingest_test"

FIXTURE_SQL = [
    f"DROP DATABASE IF EXISTS {DB}",
    f"CREATE DATABASE {DB}",
    f"USE {DB}",
    "CREATE TABLE regions (code varchar(8) PRIMARY KEY)",
    # Multi-column primary key, declared in a different order to the columns;
    # a column-level and a table-level check.
    """CREATE TABLE orders (
        id      int unsigned NOT NULL,
        region  varchar(8)   NOT NULL,
        status  enum('open','paid') NOT NULL DEFAULT 'open',
        total   decimal(10,2) CHECK (total >= 0),
        note    varchar(20),
        PRIMARY KEY (region, id),
        CONSTRAINT orders_region_fkey FOREIGN KEY (region) REFERENCES regions (code),
        CONSTRAINT orders_note_check CHECK (note <> '')
    ) ENGINE=InnoDB""",
    # Composite foreign key, a unique key and a prefix index.
    """CREATE TABLE order_lines (
        line_id      int AUTO_INCREMENT PRIMARY KEY,
        order_region varchar(8)   NOT NULL,
        order_id     int unsigned NOT NULL,
        sku          varchar(64)  NOT NULL,
        CONSTRAINT order_lines_order_fkey FOREIGN KEY (order_region, order_id)
            REFERENCES orders (region, id),
        CONSTRAINT order_lines_sku_key UNIQUE (sku),
        INDEX order_lines_sku_prefix_idx (sku(10))
    ) ENGINE=InnoDB""",
    # Self reference.
    """CREATE TABLE categories (
        id        int PRIMARY KEY,
        parent_id int,
        CONSTRAINT categories_parent_fkey FOREIGN KEY (parent_id) REFERENCES categories (id)
    ) ENGINE=InnoDB""",
    # A both-ways pair, a table with no primary key, and a JSON column.
    """CREATE TABLE users (
        id                 int PRIMARY KEY,
        default_address_id int
    ) ENGINE=InnoDB""",
    """CREATE TABLE addresses (
        id      int PRIMARY KEY,
        user_id int NOT NULL,
        CONSTRAINT addresses_user_fkey FOREIGN KEY (user_id) REFERENCES users (id)
    ) ENGINE=InnoDB""",
    """ALTER TABLE users ADD CONSTRAINT users_address_fkey
        FOREIGN KEY (default_address_id) REFERENCES addresses (id)""",
    "CREATE TABLE audit_log (note text, payload json)",
    # A view is not a table.
    "CREATE VIEW open_orders AS SELECT * FROM orders WHERE status = 'open'",
]


def _connect(dsn: str):
    import pymysql

    from schemaingest.models import ConnectRequest

    params = ConnectRequest(connectionString=dsn, schema="mysql").to_mysql_params()
    return pymysql.connect(**params, autocommit=True)


@pytest.fixture(scope="module", params=DSNS or ["unset"])
def server(request):
    """(pack, version) for one server, with the fixture database created around it."""
    from schemaingest.introspect import introspect
    from schemaingest.models import ConnectRequest

    dsn = request.param
    conn = _connect(dsn)
    with conn.cursor() as cur:
        cur.execute("SELECT VERSION()")
        version = cur.fetchone()[0]
        for stmt in FIXTURE_SQL:
            cur.execute(stmt)
        # Functional indexes arrived in MySQL 8.0.13; MariaDB has none.
        functional = "mariadb" not in version.lower()
        if functional:
            cur.execute(f"CREATE INDEX order_lines_sku_lower_idx ON {DB}.order_lines ((lower(sku)))")
    try:
        yield introspect(ConnectRequest(connectionString=dsn, schema=DB)), functional
    finally:
        with conn.cursor() as cur:
            cur.execute(f"DROP DATABASE IF EXISTS {DB}")
        conn.close()


@pytest.fixture
def pack(server):
    return server[0]


def _table(pack, name):
    return next(t for t in pack.tables if t.name == name)


def test_meta(pack):
    assert pack.meta.engine == "mysql"
    assert pack.meta.dbName == pack.meta.schema_ == DB
    assert pack.meta.dbVersion.split()[0] in ("MySQL", "MariaDB")


def test_lists_base_tables_only(pack):
    assert [t.name for t in pack.tables] == [
        "addresses", "audit_log", "categories", "order_lines", "orders", "regions", "users",
    ]
    assert {t.schema_ for t in pack.tables} == {DB}


def test_primary_key_keeps_declared_order(pack):
    orders = _table(pack, "orders")
    assert orders.primaryKey == ["region", "id"]
    assert {c.name for c in orders.columns if c.isPrimaryKey} == {"region", "id"}
    assert _table(pack, "audit_log").primaryKey == []


def test_column_types_and_defaults(pack):
    cols = {c.name: c for c in _table(pack, "orders").columns}
    assert cols["id"].type == "int unsigned" or cols["id"].type == "int(10) unsigned"
    assert cols["status"].type == "enum('open','paid')"
    assert cols["status"].default in ("open", "'open'")  # MariaDB quotes string defaults
    assert cols["total"].type == "decimal(10,2)"
    assert cols["total"].nullable is True and cols["total"].default is None
    assert cols["region"].nullable is False
    line_id = _table(pack, "order_lines").columns[0]
    assert line_id.default == "auto_increment"


def test_composite_fk_pairs_columns_without_cross_product(pack):
    rels = [r for r in pack.relationships if r.constraintName == "order_lines_order_fkey"]
    assert [(r.fromColumn, r.toTable, r.toColumn) for r in rels] == [
        ("order_region", "orders", "region"),
        ("order_id", "orders", "id"),
    ]
    fk = {c.name: c.fkRef for c in _table(pack, "order_lines").columns if c.isForeignKey}
    assert fk["order_region"].column == "region"
    assert fk["order_id"].column == "id"


def test_self_reference_and_both_ways_pair(pack):
    pairs = {(r.fromTable, r.fromColumn, r.toTable, r.toColumn) for r in pack.relationships}
    assert ("categories", "parent_id", "categories", "id") in pairs
    assert ("users", "default_address_id", "addresses", "id") in pairs
    assert ("addresses", "user_id", "users", "id") in pairs
    assert len(pack.relationships) == 6


def test_indexes(server):
    pack, functional = server
    idx = {i.name: i for i in _table(pack, "order_lines").indexes}
    assert idx["PRIMARY"].columns == ["line_id"] and idx["PRIMARY"].isUnique
    assert idx["order_lines_sku_key"].isUnique is True
    assert idx["order_lines_sku_prefix_idx"].columns == ["sku(10)"]
    assert idx["order_lines_sku_prefix_idx"].isUnique is False
    # InnoDB indexes every foreign key.
    assert idx["order_lines_order_fkey"].columns == ["order_region", "order_id"]
    if functional:
        assert "lower" in idx["order_lines_sku_lower_idx"].columns[0].lower()
    assert _table(pack, "orders").indexes[0].name == "PRIMARY"
    assert _table(pack, "orders").indexes[0].columns == ["region", "id"]


def test_constraints(pack):
    cons = {c.name: c for c in _table(pack, "orders").constraints}
    assert cons["PRIMARY"].type == "PRIMARY KEY" and cons["PRIMARY"].columns == ["region", "id"]
    assert cons["orders_region_fkey"].type == "FOREIGN KEY"
    assert cons["orders_region_fkey"].columns == ["region"]
    assert cons["orders_note_check"].type == "CHECK"
    assert "note" in cons["orders_note_check"].definition
    checks = [c for c in cons.values() if c.type == "CHECK"]
    assert len(checks) == 2  # the table-level check and the one on total
    assert any("total" in c.definition and ">= 0" in c.definition for c in checks)
    uniq = {c.name: c for c in _table(pack, "order_lines").constraints}["order_lines_sku_key"]
    assert uniq.type == "UNIQUE" and uniq.columns == ["sku"]


def test_schema_text_names_the_server(pack):
    from schemaingest.renderers import render_schema_txt

    txt = render_schema_txt(pack)
    assert f"# Server: {pack.meta.dbVersion}" in txt
    assert "order_lines.order_id -> orders.id (order_lines_order_fkey)" in txt
