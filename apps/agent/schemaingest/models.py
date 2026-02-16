"""Pydantic models matching the Schema Pack contract."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

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


class ConnectRequest(BaseModel):
    """Accepts either a full connection string OR individual fields."""
    connectionString: Optional[str] = None
    host: Optional[str] = None
    port: int = 5432
    dbname: Optional[str] = None
    user: Optional[str] = None
    password: Optional[str] = None

    def to_dsn(self) -> str:
        if self.connectionString:
            return self.connectionString
        parts = []
        if self.host:
            parts.append(f"host={self.host}")
        if self.port:
            parts.append(f"port={self.port}")
        if self.dbname:
            parts.append(f"dbname={self.dbname}")
        if self.user:
            parts.append(f"user={self.user}")
        if self.password:
            parts.append(f"password={self.password}")
        return " ".join(parts)
