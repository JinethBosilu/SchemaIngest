import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import PairPage from './pages/PairPage';
import ConnectPage from './pages/ConnectPage';
import SchemaPage from './pages/SchemaPage';
import { clearSession } from './api/agentClient';
import { useAppStore } from './store';

function AppContent() {
    const { isPaired, schemaPack, connFields, clearSessionData } = useAppStore();
    const navigate = useNavigate();

    const handleDisconnect = () => {
        clearSession();
        clearSessionData();
        navigate('/');
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
                <Routes>
                    <Route path="/" element={<PairPage />} />
                    <Route 
                        path="/connect" 
                        element={isPaired ? <ConnectPage /> : <Navigate to="/" replace />} 
                    />
                    <Route 
                        path="/schema" 
                        element={isPaired && schemaPack && connFields ? <SchemaPage /> : <Navigate to="/" replace />} 
                    />
                </Routes>
            </main>
        </div>
    );
}

export default function App() {
    return (
        <HashRouter>
            <AppContent />
        </HashRouter>
    );
}
