import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import TableList from '../components/TableList';
import TableTitle from '../components/TableTitle';
import TableDetail from '../components/TableDetail';
import ErdView, { type ErdMode } from '../components/ErdView';
import CopyButton from '../components/CopyButton';
import { renderSchemaText } from '../lib/schemaText';
import { useAppStore } from '../store';

type Tab = 'columns' | 'diagram';

const TABS: { id: Tab; label: string }[] = [
    { id: 'columns', label: 'Columns' },
    { id: 'diagram', label: 'Diagram' },
];

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
    const { meta } = pack;

    return (
        <div className="schema-page">
            <aside className="db-side" aria-label="Tables">
                <div className="db-meta">
                    <h2 title={meta.dbName}>{meta.dbName}</h2>
                    <dl>
                        {meta.dbVersion && <><dt>Server</dt><dd>{meta.dbVersion}</dd></>}
                        {/* In MySQL the schema is the database, already named above. */}
                        {meta.schema !== meta.dbName && <><dt>Schema</dt><dd>{meta.schema}</dd></>}
                        <dt>Tables</dt><dd>{pack.tables.length}</dd>
                    </dl>
                    <CopyButton getText={async () => schemaText} label="Copy for AI" />
                </div>
                <TableList tables={pack.tables} selected={selectedTable} onSelect={selectTable} />
            </aside>

            {table ? (
                <section className="sheet">
                    <TableTitle table={table} relationships={pack.relationships} />
                    <div className="tabs" role="tablist" aria-label="Table view">
                        {TABS.map(t => (
                            <button
                                key={t.id}
                                type="button"
                                role="tab"
                                className="tab"
                                aria-selected={tab === t.id}
                                onClick={() => update({ tab: t.id }, false)}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {tab === 'columns' ? (
                        <div className="tab-body" role="tabpanel">
                            <TableDetail table={table} relationships={pack.relationships} onSelect={selectTable} />
                        </div>
                    ) : (
                        <div className="tab-body flush" role="tabpanel">
                            <ErdView
                                pack={pack}
                                focus={table.name}
                                mode={mode}
                                onSelect={selectTable}
                                onMode={m => update({ view: m }, false)}
                            />
                        </div>
                    )}
                </section>
            ) : (
                <section className="sheet empty-state">
                    <p>
                        Schema <code>{meta.schema}</code> has no tables. Check the schema name
                        on the connect page, or that this user can see its tables.
                    </p>
                </section>
            )}
        </div>
    );
}
