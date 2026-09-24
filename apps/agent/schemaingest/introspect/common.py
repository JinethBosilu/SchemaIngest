"""Pack assembly shared by every engine.

Each engine reads its own catalog and hands over plain rows; turning those
rows into columns, keys and relationships happens here, once."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Optional, TypedDict

from schemaingest import __version__
from schemaingest.models import (
    ColumnInfo,
    ConstraintInfo,
    DbMeta,
    FkRef,
    IndexInfo,
    Relationship,
    TableInfo,
)


class RawColumn(TypedDict):
    name: str
    type: str
    nullable: bool
    default: Optional[str]


class RawForeignKey(TypedDict):
    """One column pair of a foreign key; a composite key is several rows
    sharing constraint_name, in key order."""
    from_column: str
    to_table: str
    to_column: str
    constraint_name: str


def build_table(
    tname: str,
    schema: str,
    columns: Iterable[RawColumn],
    pk_cols: list[str],
    fks: Iterable[RawForeignKey],
    constraints: list[ConstraintInfo],
    indexes: list[IndexInfo],
) -> tuple[TableInfo, list[Relationship]]:
    relationships: list[Relationship] = []
    fk_map: dict[str, FkRef] = {}
    for fk in fks:
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

    table = TableInfo(
        name=tname,
        schema=schema,
        columns=[
            ColumnInfo(
                name=c["name"],
                type=c["type"],
                nullable=c["nullable"],
                default=c["default"],
                isPrimaryKey=c["name"] in pk_cols,
                isForeignKey=c["name"] in fk_map,
                fkRef=fk_map.get(c["name"]),
            )
            for c in columns
        ],
        primaryKey=pk_cols,
        indexes=indexes,
        constraints=constraints,
    )
    return table, relationships


def make_meta(engine: str, db_name: str, db_version: str, schema: str) -> DbMeta:
    return DbMeta(
        engine=engine,
        dbName=db_name,
        dbVersion=db_version,
        schema=schema,
        generatedAt=datetime.now(timezone.utc).isoformat(),
        agentVersion=__version__,
    )
