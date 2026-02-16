import { useState } from 'react';
import PairPage from './pages/PairPage';
import ConnectPage from './pages/ConnectPage';
import SchemaPage from './pages/SchemaPage';
import type { SchemaPack, ConnectFields } from './types/schemaPack';
import { clearSession, getSessionToken } from './api/agentClient';

type Page = 'pair' | 'connect' | 'schema';

export default function App() {
    const [page, setPage] = useState<Page>('pair');
    const [schemaPack, setSchemaPack] = useState<SchemaPack | null>(null);
    const [connFields, setConnFields] = useState<ConnectFields | null>(null);

    const isPaired = page !== 'pair';

    const handleDisconnect = () => {
        clearSession();
        setSchemaPack(null);
        setConnFields(null);
        setPage('pair');
    };

    return (
        <div className="app">
            <header className="app-header">
                <h1>⚡ SchemaIngest</h1>
                <div className="status-badge">
                    <span className={`status-dot ${isPaired ? 'connected' : ''}`}></span>
                    <span>{isPaired ? 'Agent connected' : 'Not connected'}</span>
                    {isPaired && (
                        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={handleDisconnect}>
                            Disconnect
                        </button>
                    )}
                </div>
            </header>

            <main className="app-main">
                {page === 'pair' && (
                    <PairPage onPaired={() => setPage('connect')} />
                )}

                {page === 'connect' && (
                    <ConnectPage onIntrospected={(pack, fields) => {
                        setSchemaPack(pack);
                        setConnFields(fields);
                        setPage('schema');
                    }} />
                )}

                {page === 'schema' && schemaPack && connFields && (
                    <SchemaPage pack={schemaPack} connFields={connFields} />
                )}
            </main>
        </div>
    );
}
