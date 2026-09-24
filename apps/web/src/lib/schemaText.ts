/* The compact, token-efficient schema text behind "Copy for AI". Built from
   the pack already in the browser, so copying never reconnects to the
   database. Mirrors render_schema_txt in apps/agent/schemaingest/renderers.py -
   keep the two in step. */

import type { SchemaPack } from '../types/schemaPack';

export function renderSchemaText(pack: SchemaPack): string {
    const lines: string[] = [
        `# Database: ${pack.meta.dbName}`,
        `# Schema: ${pack.meta.schema}`,
    ];
    // Tells the reader which SQL dialect to write.
    if (pack.meta.dbVersion) lines.push(`# Server: ${pack.meta.dbVersion}`);
    lines.push(`# Generated: ${pack.meta.generatedAt}`, '');

    for (const t of pack.tables) {
        lines.push(`TABLE ${t.name}`);
        for (const c of t.columns) {
            const parts = [`  ${c.name}`, c.type];
            if (!c.nullable) parts.push('NOT NULL');
            if (c.default) parts.push(`DEFAULT ${c.default}`);
            if (c.isPrimaryKey) parts.push('PK');
            if (c.isForeignKey && c.fkRef) parts.push(`FK -> ${c.fkRef.table}.${c.fkRef.column}`);
            lines.push(parts.join(' '));
        }
        lines.push('');
    }

    const declared = pack.relationships.filter(r => !r.inferred);
    const inferred = pack.relationships.filter(r => r.inferred);
    if (declared.length) {
        lines.push('---', 'RELATIONSHIPS');
        for (const r of declared)
            lines.push(`  ${r.fromTable}.${r.fromColumn} -> ${r.toTable}.${r.toColumn} (${r.constraintName})`);
        lines.push('');
    }
    if (inferred.length) {
        lines.push('---', 'INFERRED RELATIONSHIPS (from column names; not declared in the database)');
        for (const r of inferred)
            lines.push(`  ${r.fromTable}.${r.fromColumn} -> ${r.toTable}.${r.toColumn}`);
        lines.push('');
    }

    if (pack.tables.some(t => t.indexes.length)) {
        lines.push('---', 'INDEXES');
        for (const t of pack.tables)
            for (const ix of t.indexes)
                lines.push(`  ${ix.name} ON ${t.name} (${ix.columns.join(', ')})${ix.isUnique ? ' UNIQUE' : ''}`);
        lines.push('');
    }

    return lines.join('\n');
}
