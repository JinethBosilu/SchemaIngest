"""Pydantic models matching the Schema Pack contract."""

from __future__ import annotations

import ssl
from typing import Any, Literal, Optional
from urllib.parse import parse_qsl, unquote, urlsplit

from pydantic import BaseModel, Field


# ─── Schema Pack models ───────────────────────────────────────────────

class FkRef(BaseModel):
    table: str
    column: str


class ColumnInfo(BaseModel):
    name: str
    type: str
    nullable: bool
    default: Optional[str] = None
    isPrimaryKey: bool = Field(default=False, alias="isPrimaryKey")
    isForeignKey: bool = Field(default=False, alias="isForeignKey")
    fkRef: Optional[FkRef] = None

    model_config = {"populate_by_name": True}


class IndexInfo(BaseModel):
    name: str
    columns: list[str]
    isUnique: bool = Field(default=False, alias="isUnique")

    model_config = {"populate_by_name": True}


class ConstraintInfo(BaseModel):
    name: str
    type: str  # "PRIMARY KEY" | "FOREIGN KEY" | "UNIQUE" | "CHECK"
    columns: list[str]
    definition: Optional[str] = None


class TableInfo(BaseModel):
    name: str
    schema_: str = Field(alias="schema")
    columns: list[ColumnInfo]
    primaryKey: list[str] = Field(default_factory=list, alias="primaryKey")
    indexes: list[IndexInfo] = Field(default_factory=list)
    constraints: list[ConstraintInfo] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class Relationship(BaseModel):
    fromTable: str = Field(alias="fromTable")
    fromColumn: str = Field(alias="fromColumn")
    toTable: str = Field(alias="toTable")
    toColumn: str = Field(alias="toColumn")
    constraintName: str = Field(alias="constraintName")

    model_config = {"populate_by_name": True}


class DbMeta(BaseModel):
    engine: str = "postgresql"  # "postgresql" | "mysql" (MySQL and MariaDB)
    dbName: str = Field(alias="dbName")
    dbVersion: str = Field(default="", alias="dbVersion")
    schema_: str = Field(default="public", alias="schema")
    generatedAt: str = Field(alias="generatedAt")
    agentVersion: str = Field(alias="agentVersion")

    model_config = {"populate_by_name": True}


class SchemaPack(BaseModel):
    meta: DbMeta
    tables: list[TableInfo]
    relationships: list[Relationship] = Field(default_factory=list)


# ─── Request models ──────────────────────────────────────────────────

class PairRequest(BaseModel):
    code: str


Engine = Literal["postgresql", "mysql"]

_MYSQL_SCHEMES = ("mysql://", "mariadb://")
_MYSQL_SSL_MODES = ("DISABLED", "PREFERRED", "REQUIRED", "VERIFY_CA", "VERIFY_IDENTITY")


class ConnectRequest(BaseModel):
    """Accepts either a full connection string OR individual fields.

    Port and schema default per engine: 5432 and "public" for PostgreSQL;
    3306 and the database itself for MySQL, where a database is a schema."""
    engine: Optional[Engine] = None
    connectionString: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    dbname: Optional[str] = None
    user: Optional[str] = None
    password: Optional[str] = None
    schema_: Optional[str] = Field(default=None, alias="schema")

    model_config = {"populate_by_name": True}

    def resolved_engine(self) -> Engine:
        """An explicit engine wins; otherwise a mysql:// or mariadb:// string
        means MySQL, and anything else - a libpq URI or keyword string - PostgreSQL."""
        if self.engine:
            return self.engine
        conn = (self.connectionString or "").strip().lower()
        return "mysql" if conn.startswith(_MYSQL_SCHEMES) else "postgresql"

    def resolved_schema(self) -> str:
        if self.schema_:
            return self.schema_
        if self.resolved_engine() == "mysql":
            return self.to_mysql_params()["database"]
        return "public"

    def to_dsn(self) -> str:
        if self.connectionString:
            return self.connectionString
        # make_dsn quotes values, so a password with spaces or quotes survives.
        from psycopg2.extensions import make_dsn

        fields = {
            "host": self.host,
            "port": self.port,
            "dbname": self.dbname,
            "user": self.user,
            "password": self.password,
        }
        return make_dsn(**{k: v for k, v in fields.items() if v})

    def to_mysql_params(self) -> dict[str, Any]:
        """Keyword arguments for pymysql.connect, from a mysql:// URL or the fields."""
        params: dict[str, Any]
        options: dict[str, str] = {}
        if self.connectionString:
            url = urlsplit(self.connectionString.strip())
            if url.scheme.lower() not in ("mysql", "mariadb"):
                raise ValueError("A MySQL connection string starts with mysql://")
            params = {
                "host": url.hostname,
                "port": url.port,
                "user": unquote(url.username) if url.username else None,
                "password": unquote(url.password) if url.password else None,
                "database": unquote(url.path.lstrip("/")),
            }
            options = {k.lower().replace("_", "-"): v for k, v in parse_qsl(url.query)}
        else:
            params = {
                "host": self.host,
                "port": self.port,
                "user": self.user,
                "password": self.password,
                "database": self.dbname,
            }

        # The schema, when named, is the database; otherwise the URL must say.
        params["database"] = self.schema_ or params["database"]
        if not params["database"]:
            raise ValueError("Put the database in the connection string: mysql://user@host/mydb")

        unknown = set(options) - {"ssl-mode"}
        if unknown:
            raise ValueError(
                f"Unsupported connection option(s): {', '.join(sorted(unknown))}. "
                "Only ssl-mode is understood."
            )
        mode = options.get("ssl-mode", "PREFERRED").upper()
        if mode not in _MYSQL_SSL_MODES:
            raise ValueError(f"ssl-mode must be one of {', '.join(_MYSQL_SSL_MODES)}")
        if mode == "REQUIRED":
            params["ssl"] = {}  # encrypted, certificate not checked
        elif mode in ("VERIFY_CA", "VERIFY_IDENTITY"):
            ctx = ssl.create_default_context()
            ctx.check_hostname = mode == "VERIFY_IDENTITY"
            params["ssl"] = ctx

        params["host"] = params["host"] or "localhost"
        params["port"] = params["port"] or 3306
        return {k: v for k, v in params.items() if v is not None}
