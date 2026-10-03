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
        <>
            <div className="table-search">
                <input
                    type="search"
                    className="form-input"
                    placeholder="Find a table"
                    aria-label="Find a table"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>
            {filteredTables.length === 0 ? (
                <p className="table-list-empty">No table names contain “{search}”.</p>
            ) : (
                <ul className="table-list">
                    {filteredTables.map(t => (
                        <li key={t.name}>
                            <button
                                type="button"
                                aria-current={t.name === selected}
                                onClick={() => onSelect(t.name)}
                                title={`${t.name}, ${t.columns.length} columns`}
                            >
                                <span className="nm">{t.name}</span>
                                <span className="n">{t.columns.length}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}
