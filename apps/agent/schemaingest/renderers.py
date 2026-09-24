"""Renderers: AI-friendly schema.txt and Mermaid ERD."""

from __future__ import annotations

import re

from schemaingest.models import SchemaPack

_MERMAID_UNSAFE = re.compile(r"[^A-Za-z0-9_]")


def _mermaid_ident(text: str) -> str:
    """Mermaid ERD identifiers allow only word characters, and must not start
    with a digit - `character varying(255)` and `_int4[]` both break it."""
    ident = _MERMAID_UNSAFE.sub("_", text).strip("_") or "_"
    return ident if ident[0].isalpha() else "t" + ident


def render_schema_txt(pack: SchemaPack) -> str:
    """Generate a compact, token-efficient plain-text schema description.

    Format per table:
        TABLE <name>
          <col> <type> [NOT NULL] [DEFAULT ...] [PK] [FK -> table.col]
        ---
        RELATIONSHIPS
          table.col -> table.col (constraint)
        ---
        INDEXES
          index_name ON table (cols) [UNIQUE]
    """
    lines: list[str] = []

    # Header
    lines.append(f"# Database: {pack.meta.dbName}")
    lines.append(f"# Schema: {pack.meta.schema_}")
    if pack.meta.dbVersion:
        # Tells the reader which SQL dialect to write.
        lines.append(f"# Server: {pack.meta.dbVersion}")
    lines.append(f"# Generated: {pack.meta.generatedAt}")
    lines.append("")

    for t in pack.tables:
        lines.append(f"TABLE {t.name}")
        for c in t.columns:
            parts = [f"  {c.name}", c.type]
            if not c.nullable:
                parts.append("NOT NULL")
            if c.default:
                parts.append(f"DEFAULT {c.default}")
            if c.isPrimaryKey:
                parts.append("PK")
            if c.isForeignKey and c.fkRef:
                parts.append(f"FK -> {c.fkRef.table}.{c.fkRef.column}")
            lines.append(" ".join(parts))
        lines.append("")

    # Relationships section
    if pack.relationships:
        lines.append("---")
        lines.append("RELATIONSHIPS")
        for r in pack.relationships:
            lines.append(f"  {r.fromTable}.{r.fromColumn} -> {r.toTable}.{r.toColumn} ({r.constraintName})")
        lines.append("")

    # Indexes section
    has_indexes = any(t.indexes for t in pack.tables)
    if has_indexes:
        lines.append("---")
        lines.append("INDEXES")
        for t in pack.tables:
            for ix in t.indexes:
                uniq = " UNIQUE" if ix.isUnique else ""
                cols = ", ".join(ix.columns)
                lines.append(f"  {ix.name} ON {t.name} ({cols}){uniq}")
        lines.append("")

    return "\n".join(lines)


def render_erd_mermaid(pack: SchemaPack) -> str:
    """Generate a Mermaid erDiagram from the schema pack."""
    lines: list[str] = ["erDiagram"]

    for t in pack.tables:
        lines.append(f"    {_mermaid_ident(t.name)} {{")
        for c in t.columns:
            markers = []
            if c.isPrimaryKey:
                markers.append("PK")
            if c.isForeignKey:
                markers.append("FK")
            marker_str = " " + ", ".join(markers) if markers else ""
            lines.append(f"        {_mermaid_ident(c.type)} {_mermaid_ident(c.name)}{marker_str}")
        lines.append("    }")

    # Relationships - one line per foreign key, not per column of a composite one.
    seen: set[tuple[str, str]] = set()
    for r in pack.relationships:
        if (r.fromTable, r.constraintName) in seen:
            continue
        seen.add((r.fromTable, r.constraintName))
        label = r.constraintName.replace('"', "'")
        lines.append(f'    {_mermaid_ident(r.toTable)} ||--o{{ {_mermaid_ident(r.fromTable)} : "{label}"')

    return "\n".join(lines)
