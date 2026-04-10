"""Renderers: AI-friendly schema.txt and Mermaid ERD."""

from __future__ import annotations

from schemaingest.models import SchemaPack


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
        lines.append(f"    {t.name} {{")
        for c in t.columns:
            markers = []
            if c.isPrimaryKey:
                markers.append("PK")
            if c.isForeignKey:
                markers.append("FK")
            marker_str = f' "{",".join(markers)}"' if markers else ""
            # Mermaid doesn't allow spaces or special chars in types for ERDs.
            safe_type = c.type.replace(" ", "_").replace("(", "_").replace(")", "")
            safe_name = c.name.replace(" ", "_")
            lines.append(f"        {safe_type} {safe_name}{marker_str}")
        lines.append("    }")

    # Relationships
    for r in pack.relationships:
        lines.append(f"    {r.toTable} ||--o{{ {r.fromTable} : \"{r.constraintName}\"")

    return "\n".join(lines)
