"""Schema introspection, one module per database engine."""

from __future__ import annotations

from schemaingest.models import ConnectRequest, SchemaPack


def introspect(req: ConnectRequest) -> SchemaPack:
    """Introspect the database a connect request names, whichever engine it is."""
    # Drivers load on demand, so one engine's driver failing to import does
    # not take the other engine down with it.
    if req.resolved_engine() == "mysql":
        from schemaingest.introspect.mysql import introspect_mysql

        return introspect_mysql(req.to_mysql_params(), schema=req.resolved_schema())

    from schemaingest.introspect.postgres import introspect_postgres

    return introspect_postgres(req.to_dsn(), schema=req.resolved_schema())
