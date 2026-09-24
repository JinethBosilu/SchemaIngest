"""Schema introspection, one module per database engine."""

from __future__ import annotations

from schemaingest.infer import infer_relationships
from schemaingest.models import ConnectRequest, SchemaPack


def introspect(req: ConnectRequest) -> SchemaPack:
    """Introspect the database a connect request names, whichever engine it is.

    Declared foreign keys come first; links inferred from column names follow,
    marked inferred, for the columns no declared key covers."""
    # Drivers load on demand, so one engine's driver failing to import does
    # not take the other engine down with it.
    if req.resolved_engine() == "mysql":
        from schemaingest.introspect.mysql import introspect_mysql

        pack = introspect_mysql(req.to_mysql_params(), schema=req.resolved_schema())
    else:
        from schemaingest.introspect.postgres import introspect_postgres

        pack = introspect_postgres(req.to_dsn(), schema=req.resolved_schema())

    pack.relationships += infer_relationships(pack.tables, pack.relationships)
    return pack
