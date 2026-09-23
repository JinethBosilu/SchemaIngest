from __future__ import annotations

import pytest

from schemaingest import security
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


@pytest.fixture(autouse=True)
def _reset_security_state():
    """Pairing code, sessions and rate-limit hits are module globals."""
    security.set_pairing_code("")
    security._sessions.clear()
    security.rate_limiter._hits.clear()
    yield
    security.set_pairing_code("")
    security._sessions.clear()
    security.rate_limiter._hits.clear()


@pytest.fixture
def pack() -> SchemaPack:
    """Two tables joined by a composite foreign key, plus an array column."""
    return SchemaPack(
        meta=DbMeta(dbName="shop", dbVersion="PostgreSQL 16", schema="public",
                    generatedAt="2026-01-01T00:00:00+00:00", agentVersion="test"),
        tables=[
            TableInfo(
                name="orders",
                schema="public",
                columns=[
                    ColumnInfo(name="region", type="text", nullable=False, isPrimaryKey=True),
                    ColumnInfo(name="id", type="integer", nullable=False, isPrimaryKey=True),
                    ColumnInfo(name="tags", type="text[]", nullable=True),
                ],
                primaryKey=["region", "id"],
                indexes=[IndexInfo(name="orders_pkey", columns=["region", "id"], isUnique=True)],
                constraints=[ConstraintInfo(name="orders_pkey", type="PRIMARY KEY", columns=["region", "id"])],
            ),
            TableInfo(
                name="order_lines",
                schema="public",
                columns=[
                    ColumnInfo(name="line_id", type="integer", nullable=False, isPrimaryKey=True),
                    ColumnInfo(name="order_region", type="character varying(8)", nullable=False,
                               isForeignKey=True, fkRef=FkRef(table="orders", column="region")),
                    ColumnInfo(name="order_id", type="integer", nullable=False,
                               isForeignKey=True, fkRef=FkRef(table="orders", column="id")),
                ],
                primaryKey=["line_id"],
            ),
        ],
        relationships=[
            Relationship(fromTable="order_lines", fromColumn="order_region", toTable="orders",
                         toColumn="region", constraintName="order_lines_order_fkey"),
            Relationship(fromTable="order_lines", fromColumn="order_id", toTable="orders",
                         toColumn="id", constraintName="order_lines_order_fkey"),
        ],
    )
