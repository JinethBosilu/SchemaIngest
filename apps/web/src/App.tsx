import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import PairPage from './pages/PairPage';
import ConnectPage from './pages/ConnectPage';
import SchemaPage from './pages/SchemaPage';
import ThemeSwitch from './components/ThemeSwitch';
import { clearSession } from './api/agentClient';
import { useAppStore } from './store';

function AppContent() {
    const { isPaired, schemaPack, clearSessionData } = useAppStore();
    const navigate = useNavigate();

    const handleDisconnect = () => {
        clearSession();
        clearSessionData();
        navigate('/');
    };

    return (
        <div className="app">
            <header className="app-header">
                <div className="brand">
                    {/* A table with its header row filled in: the thing this tool reads. */}
                    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                        <rect x="1" y="1" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" />
                        <rect x="1" y="1" width="18" height="6" fill="currentColor" />
                        <path d="M1 13h18M7 7v12" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                    SchemaIngest
                </div>
                <div className="header-end">
                    <ThemeSwitch />
                    <div className="agent-status">
                        <span className={`status-dot ${isPaired ? 'connected' : ''}`} aria-hidden="true"></span>
                        <span className="label">{isPaired ? 'Agent paired' : 'No agent paired'}</span>
                        {isPaired && (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={handleDisconnect}>
                                Disconnect
                            </button>
                        )}
                    </div>
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
                        element={isPaired && schemaPack ? <SchemaPage /> : <Navigate to="/" replace />} 
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
