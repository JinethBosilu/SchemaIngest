import { useState } from 'react';
import TableList from '../components/TableList';
import TableDetail from '../components/TableDetail';
import ErdDiagram from '../components/ErdDiagram';
import CopyButton from '../components/CopyButton';
import { getSchemaText, getErdMermaid } from '../api/agentClient';
import { useAppStore } from '../store';

type Tab = 'columns' | 'erd';

export default function SchemaPage() {
    const { schemaPack: pack, connFields } = useAppStore();
    
    // We shouldn't render this page unless pack is available (guarded by Route),
    // but TypeScript needs to know it's not null here.
    if (!pack || !connFields) return null;

    const [selectedTable, setSelectedTable] = useState(pack.tables[0]?.name ?? '');
    const [tab, setTab] = useState<Tab>('columns');
    const [schemaText, setSchemaText] = useState<string | null>(null);
    const [mermaidText, setMermaidText] = useState<string | null>(null);
    const [loadingText, setLoadingText] = useState(false);

    const table = pack.tables.find(t => t.name === selectedTable);

    const handleCopyForAI = async () => {
        if (schemaText) return schemaText;
        setLoadingText(true);
        try {
            const text = await getSchemaText(connFields);
            setSchemaText(text);
            return text;
        } catch {
            return '(Failed to load schema text)';
        } finally {
            setLoadingText(false);
        }
    };

    const handleLoadErd = async () => {
        if (mermaidText) return mermaidText;
        try {
            const text = await getErdMermaid(connFields);
            setMermaidText(text);
            return text;
        } catch (e: any) {
            throw e;
        }
    };

    return (
        <div className="schema-page">
            {/* Left panel: table list */}
            <div className="card" style={{ padding: 16, alignSelf: 'flex-start', position: 'sticky', top: 80 }}>
                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{pack.meta.dbName}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{pack.tables.length} tables</div>
                    </div>
                    <CopyButton
                        getText={handleCopyForAI}
                        loading={loadingText}
                        label="📋 Copy for AI"
                    />
                </div>
                <TableList
                    tables={pack.tables}
                    selected={selectedTable}
                    onSelect={setSelectedTable}
                />
            </div>

            {/* Right panel: detail */}
            <div className="detail-panel">
                {table ? (
                    <>
                        <div className="card">
                            <div className="tabs">
                                <button className={`tab ${tab === 'columns' ? 'active' : ''}`} onClick={() => setTab('columns')}>
                                    Columns & Indexes
                                </button>
                                <button
                                    className={`tab ${tab === 'erd' ? 'active' : ''}`}
                                    onClick={() => { setTab('erd'); handleLoadErd(); }}
                                >
                                    ERD Diagram
                                </button>
                            </div>

                            {tab === 'columns' && (
                                <TableDetail table={table} relationships={pack.relationships} />
                            )}

                            {tab === 'erd' && (
                                <ErdDiagram mermaidCode={mermaidText} onLoad={handleLoadErd} />
                            )}
                        </div>
                    </>
                ) : (
                    <div className="empty-state">
                        <div className="empty-icon">📊</div>
                        <p>Select a table to view its schema</p>
                    </div>
                )}
            </div>
        </div>
    );
}
