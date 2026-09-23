import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import TableList from '../components/TableList';
import TableDetail from '../components/TableDetail';
import ErdView, { type ErdMode } from '../components/ErdView';
import CopyButton from '../components/CopyButton';
import { renderSchemaText } from '../lib/schemaText';
import { useAppStore } from '../store';

type Tab = 'columns' | 'diagram';

export default function SchemaPage() {
    const pack = useAppStore(s => s.schemaPack);
    const [params, setParams] = useSearchParams();

    // The selection lives in the URL (#/schema?table=x&tab=diagram&view=graph),
    // so moving from table to table is a navigation that back and forward walk.
    const tab: Tab = params.get('tab') === 'diagram' ? 'diagram' : 'columns';
    const mode: ErdMode = params.get('view') === 'graph' ? 'graph' : 'table';
    const requested = params.get('table');
    const selectedTable = pack?.tables.some(t => t.name === requested)
        ? requested!
        : pack?.tables[0]?.name ?? '';

    const update = useCallback((changes: Record<string, string>, push: boolean) => {
        setParams(prev => {
            const next = new URLSearchParams(prev);
            for (const [k, v] of Object.entries(changes)) next.set(k, v);
            return next;
        }, { replace: !push });
    }, [setParams]);

    const selectTable = useCallback((name: string) => {
        if (name !== selectedTable) update({ table: name }, true);
    }, [selectedTable, update]);

    const schemaText = useMemo(() => (pack ? renderSchemaText(pack) : ''), [pack]);

    // Guarded by the route, but TypeScript needs to know it's not null here.
    if (!pack) return null;

    const table = pack.tables.find(t => t.name === selectedTable);

    return (
        <div className="schema-page">
            {/* Left panel: table list */}
            <div className="card" style={{ padding: 16, alignSelf: 'flex-start', position: 'sticky', top: 80 }}>
                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{pack.meta.dbName}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {pack.meta.schema} · {pack.tables.length} tables
                        </div>
                    </div>
                    <CopyButton getText={async () => schemaText} label="📋 Copy for AI" />
                </div>
                <TableList
                    tables={pack.tables}
                    selected={selectedTable}
                    onSelect={selectTable}
                />
            </div>

            {/* Right panel: detail */}
            <div className="detail-panel">
                {table ? (
                    <div className="card">
                        <div className="tabs">
                            <button
                                className={`tab ${tab === 'columns' ? 'active' : ''}`}
                                onClick={() => update({ tab: 'columns' }, false)}
                            >
                                Columns & Indexes
                            </button>
                            <button
                                className={`tab ${tab === 'diagram' ? 'active' : ''}`}
                                onClick={() => update({ tab: 'diagram' }, false)}
                            >
                                Diagram
                            </button>
                        </div>

                        {tab === 'columns' && (
                            <TableDetail table={table} relationships={pack.relationships} />
                        )}

                        {tab === 'diagram' && (
                            <ErdView
                                pack={pack}
                                focus={table.name}
                                mode={mode}
                                onSelect={selectTable}
                                onMode={m => update({ view: m }, false)}
                            />
                        )}
                    </div>
                ) : (
                    <div className="empty-state">
                        <div className="empty-icon">📊</div>
                        <p>{pack.tables.length ? 'Select a table to view its schema' : `No tables in schema "${pack.meta.schema}"`}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
