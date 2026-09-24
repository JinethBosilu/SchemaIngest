from __future__ import annotations

import re

from schemaingest.renderers import render_erd_mermaid, render_schema_txt


def test_schema_txt_lists_tables_columns_and_relationships(pack):
    txt = render_schema_txt(pack)
    assert txt.startswith("# Database: shop\n# Schema: public\n# Server: PostgreSQL 16\n# Generated: ")
    assert "TABLE orders" in txt
    assert "  id integer NOT NULL PK" in txt
    assert "  order_id integer NOT NULL FK -> orders.id" in txt
    assert "order_lines.order_region -> orders.region (order_lines_order_fkey)" in txt
    assert "orders_pkey ON orders (region, id) UNIQUE" in txt


def test_mermaid_identifiers_are_safe(pack):
    mmd = render_erd_mermaid(pack)
    attr_lines = [line.strip() for line in mmd.splitlines() if line.startswith("        ")]
    for line in attr_lines:
        type_, name = line.split()[:2]
        assert re.fullmatch(r"[A-Za-z]\w*", type_), line
        assert re.fullmatch(r"[A-Za-z]\w*", name), line
    assert "text tags" in mmd
    assert "character_varying_8 order_region FK" in mmd


def test_mermaid_key_markers_are_not_comments(pack):
    mmd = render_erd_mermaid(pack)
    assert "text region PK" in mmd
    assert '"PK' not in mmd


def test_mermaid_draws_composite_fk_once(pack):
    mmd = render_erd_mermaid(pack)
    assert mmd.count("||--o{") == 1
    assert 'orders ||--o{ order_lines : "order_lines_order_fkey"' in mmd
