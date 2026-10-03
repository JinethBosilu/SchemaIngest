import { useMemo } from 'react';
import type { TableInfo, Relationship } from '../types/schemaPack';
import { tableRefs } from '../lib/tableRefs';

interface TableTitleProps {
    table: TableInfo;
    relationships: Relationship[];
}

/* The title block of a drawing sheet: what this table is called, and the
   handful of numbers you check before reading its columns. */
export default function TableTitle({ table, relationships }: TableTitleProps) {
    const refs = useMemo(() => tableRefs(relationships, table.name), [relationships, table.name]);
    const pk = table.primaryKey;

    return (
        <header className="titleblock">
            <h1>{table.name}</h1>
            <dl>
                <div><dt>Schema</dt><dd className="mono">{table.schema}</dd></div>
                <div><dt>Columns</dt><dd>{table.columns.length}</dd></div>
                <div>
                    <dt>Primary key</dt>
                    <dd className="mono">{pk.length === 0 ? 'none' : pk.length === 1 ? pk[0] : `${pk.length} columns`}</dd>
                </div>
                <div><dt>References</dt><dd>{refs.outCount}</dd></div>
                <div><dt>Referenced by</dt><dd>{refs.inCount}</dd></div>
                {table.storageEngine && (
                    <div><dt>Engine</dt><dd className="mono">{table.storageEngine}</dd></div>
                )}
            </dl>
        </header>
    );
}
