import { useState, useMemo } from 'react';
import type { TableInfo } from '../types/schemaPack';

interface TableListProps {
    tables: TableInfo[];
    selected: string;
    onSelect: (name: string) => void;
}

export default function TableList({ tables, selected, onSelect }: TableListProps) {
    const [search, setSearch] = useState('');

    const filteredTables = useMemo(() => {
        if (!search) return tables;
        const lowerSearch = search.toLowerCase();
        return tables.filter(t => t.name.toLowerCase().includes(lowerSearch));
    }, [tables, search]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ marginBottom: 12 }}>
                <input
                    type="text"
                    className="form-input"
                    placeholder="Search tables..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px' }}
                />
            </div>
            {filteredTables.length === 0 ? (
                <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: '0.875rem' }}>No tables found.</div>
            ) : (
                <ul className="table-list" style={{ overflowY: 'auto', flex: 1 }}>
                    {filteredTables.map(t => (
                        <li
                            key={t.name}
                            className={`table-list-item ${t.name === selected ? 'active' : ''}`}
                            onClick={() => onSelect(t.name)}
                        >
                            <span className="table-icon">⊞</span>
                            <span>{t.name}</span>
                            <span className="col-count">{t.columns.length} cols</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
