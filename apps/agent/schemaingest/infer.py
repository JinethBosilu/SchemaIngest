"""Relationships inferred from column names, for databases that do not declare them.

MyISAM tables discard FOREIGN KEY clauses, and many applications never declare
keys at all and rely on names like user_id. Without declared keys every table
looks unrelated, so this finds the links such names plainly mean.

It is deliberately conservative - a wrong link misleads more than a missing
one. A column is linked only when all of these hold:
  - it is named <stem>_id or <stem>Id, and is not already in a declared key,
    nor its own table's single-column primary key;
  - a table in the schema is named after the stem (or its plural, or a trailing
    part of it: shipping_address_id -> addresses), or it is parent_id and no
    parent table exists, which means the table itself;
  - that table has a single-column primary key;
  - the two column types are of the same kind (both integer, both text).
Every inferred link is marked inferred, so nothing presents it as declared.
"""

from __future__ import annotations

import re

from schemaingest.models import Relationship, TableInfo

_INT_TYPES = {
    "int", "integer", "bigint", "smallint", "mediumint", "tinyint", "int2", "int4", "int8",
    "serial", "bigserial", "smallserial", "numeric", "decimal",
}
_TEXT_TYPES = {
    "char", "varchar", "character", "text", "tinytext", "mediumtext", "longtext",
    "nchar", "nvarchar", "uuid", "citext",
}


def _kind(type_: str) -> str:
    """"int unsigned", "int(11)" and "bigint" are all integers; "character varying(8)" is text."""
    base = re.split(r"[\s(\[]", type_.strip().lower(), maxsplit=1)[0]
    if base in _INT_TYPES:
        return "int"
    if base in _TEXT_TYPES:
        return "text"
    return base


def _snake(name: str) -> str:
    """userId -> user_id, shippingAddressID -> shipping_address_id."""
    name = re.sub(r"(?<=[a-z0-9])(ID|Id)$", r"_id", name)
    return re.sub(r"(?<=[a-z0-9])([A-Z])", r"_\1", name).lower()


def _names_for(stem: str) -> list[str]:
    """Table names a stem could mean, most specific first."""
    words = stem.split("_")
    names: list[str] = []
    for i in range(len(words)):
        s = "_".join(words[i:])
        names += [s, s + "s", s + "es"]
        if s.endswith("y"):
            names.append(s[:-1] + "ies")
    return names


def infer_relationships(tables: list[TableInfo], declared: list[Relationship]) -> list[Relationship]:
    by_lower = {t.name.lower(): t for t in tables}
    in_a_key = {(r.fromTable, r.fromColumn) for r in declared}
    inferred: list[Relationship] = []

    for t in tables:
        for col in t.columns:
            if (t.name, col.name) in in_a_key or t.primaryKey == [col.name]:
                continue
            m = re.fullmatch(r"(.+)_id", _snake(col.name))
            if not m:
                continue
            stem = m.group(1)

            target = next((by_lower[n] for n in _names_for(stem) if n in by_lower), None)
            if target is None and stem == "parent":
                target = t
            if target is None or len(target.primaryKey) != 1:
                continue
            pk = target.primaryKey[0]
            if target is t and pk == col.name:
                continue
            pk_col = next((c for c in target.columns if c.name == pk), None)
            if pk_col is None or _kind(pk_col.type) != _kind(col.type):
                continue

            inferred.append(Relationship(
                fromTable=t.name,
                fromColumn=col.name,
                toTable=target.name,
                toColumn=pk,
                constraintName=f"inferred:{col.name}",
                inferred=True,
            ))
    return inferred
