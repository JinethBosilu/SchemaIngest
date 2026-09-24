/* ─── TypeScript interfaces mirroring the Schema Pack contract ─── */

export interface FkRef {
    table: string;
    column: string;
}

export interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
    default: string | null;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    fkRef: FkRef | null;
}

export interface IndexInfo {
    name: string;
    columns: string[];
    isUnique: boolean;
}

export interface ConstraintInfo {
    name: string;
    type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK';
    columns: string[];
    definition: string | null;
}

export interface TableInfo {
    name: string;
    schema: string;
    columns: ColumnInfo[];
    primaryKey: string[];
    indexes: IndexInfo[];
    constraints: ConstraintInfo[];
    storageEngine?: string | null;  // MySQL only; MyISAM keeps no foreign keys
}

export interface Relationship {
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
    constraintName: string;
    inferred?: boolean;   // guessed from column names, not declared in the database
}

/** mysql covers MariaDB too; DbMeta.dbVersion names which. */
export type Engine = 'postgresql' | 'mysql';

export interface DbMeta {
    engine?: Engine;      // absent in packs from agents before MySQL support
    dbName: string;
    dbVersion: string;
    schema: string;
    generatedAt: string;
    agentVersion: string;
}

export interface SchemaPack {
    meta: DbMeta;
    tables: TableInfo[];
    relationships: Relationship[];
}

export interface ConnectFields {
    engine?: Engine;
    connectionString?: string;
    host?: string;
    port?: number;
    dbname?: string;
    user?: string;
    password?: string;
    schema?: string;      // PostgreSQL only; in MySQL the database is the schema
}
