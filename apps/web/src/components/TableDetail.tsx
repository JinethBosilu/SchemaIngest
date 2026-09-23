import { useMemo } from 'react';
import type { TableInfo, Relationship } from '../types/schemaPack';

interface TableDetailProps {
    table: TableInfo;
    relationships: Relationship[];
}

export default function TableDetail({ table, relationships }: TableDetailProps) {
    // One entry per foreign key: a composite key's columns share a constraint name.
    const tableRels = useMemo(() => {
        const byKey = new Map<string, { key: string; fromTable: string; toTable: string;
                                        constraintName: string; from: string[]; to: string[] }>();
        for (const r of relationships) {
            if (r.fromTable !== table.name && r.toTable !== table.name) continue;
            const key = `${r.fromTable}.${r.constraintName}`;
            let g = byKey.get(key);
            if (!g) {
                g = { key, fromTable: r.fromTable, toTable: r.toTable, constraintName: r.constraintName, from: [], to: [] };
                byKey.set(key, g);
            }
            g.from.push(r.fromColumn);
            g.to.push(r.toColumn);
        }
        return [...byKey.values()];
    }, [relationships, table.name]);
    const cols = (c: string[]) => (c.length === 1 ? c[0] : `(${c.join(', ')})`);

    return (
        <div>
            <div className="detail-header">
                <h2>{table.name}</h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {table.schema}.{table.name}
                </span>
            </div>

            {/* Columns */}
            <table className="columns-table">
                <thead>
                    <tr>
                        <th>Column</th>
                        <th>Type</th>
                        <th>Nullable</th>
                        <th>Default</th>
                        <th>Keys</th>
                    </tr>
                </thead>
                <tbody>
                    {table.columns.map(col => (
                        <tr key={col.name}>
                            <td className="col-name">{col.name}</td>
                            <td className="col-type">{col.type}</td>
                            <td>{col.nullable ? '✓' : <span className="badge badge-notnull">NOT NULL</span>}</td>
                            <td style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                                {col.default ?? '—'}
                            </td>
                            <td>
                                {col.isPrimaryKey && <span className="badge badge-pk">PK</span>}
                                {col.isForeignKey && (
                                    <span className="badge badge-fk" title={col.fkRef ? `→ ${col.fkRef.table}.${col.fkRef.column}` : ''}>
                                        FK{col.fkRef ? ` → ${col.fkRef.table}` : ''}
                                    </span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Indexes */}
            {table.indexes.length > 0 && (
                <div style={{ marginTop: 20 }}>
                    <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        Indexes ({table.indexes.length})
                    </h3>
                    <ul className="indexes-list">
                        {table.indexes.map(ix => (
                            <li key={ix.name}>
                                <span className="idx-name">{ix.name}</span>
                                <span className="idx-cols">({ix.columns.join(', ')})</span>
                                {ix.isUnique && <span className="badge badge-unique">UNIQUE</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Relationships */}
            {tableRels.length > 0 && (
                <div style={{ marginTop: 20 }}>
                    <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        Relationships ({tableRels.length})
                    </h3>
                    <ul className="indexes-list">
                        {tableRels.map(r => (
                            <li key={r.key}>
                                <span className="idx-name">{r.fromTable}.{cols(r.from)}</span>
                                <span style={{ color: 'var(--text-muted)' }}>→</span>
                                <span className="idx-name">{r.toTable}.{cols(r.to)}</span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({r.constraintName})</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
