import type { TableInfo } from '../types/schemaPack';

interface TableListProps {
    tables: TableInfo[];
    selected: string;
    onSelect: (name: string) => void;
}

export default function TableList({ tables, selected, onSelect }: TableListProps) {
    return (
        <ul className="table-list">
            {tables.map(t => (
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
    );
}
