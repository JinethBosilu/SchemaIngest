import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { detectAgent, pair } from '../api/agentClient';
import { useAppStore } from '../store';

export default function PairPage() {
    const navigate = useNavigate();
    const { setIsPaired } = useAppStore();
    const [agentStatus, setAgentStatus] = useState<'detecting' | 'found' | 'not-found'>('detecting');
    const [agentVersion, setAgentVersion] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Look for the agent now, then every 3s until it answers.
    useEffect(() => {
        let cancelled = false;
        let timer: number | undefined;
        const check = async () => {
            try {
                const data = await detectAgent();
                if (cancelled) return;
                setAgentStatus('found');
                setAgentVersion(data.version);
            } catch {
                if (cancelled) return;
                setAgentStatus('not-found');
                timer = window.setTimeout(check, 3000);
            }
        };
        check();
        return () => { cancelled = true; window.clearTimeout(timer); };
    }, []);

    const handlePair = async () => {
        if (code.length !== 6) return;
        setLoading(true);
        setError('');
        try {
            await pair(code);
            setIsPaired(true);
            navigate('/connect');
        } catch (e: any) {
            setError(e.message || 'Pairing failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="pair-page">
            <div className="card pair-card">
                <div className="icon">🔗</div>
                <div className="card-header">
                    <h2>Connect to Agent</h2>
                    <p>
                        Run <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--info)' }}>schemaingest agent</code> on your machine,
                        then enter the 6-digit pairing code below.
                    </p>
                </div>

                {/* Agent detection status */}
                {agentStatus === 'detecting' && (
                    <div className="pair-status detecting">
                        <span className="spinner" style={{ marginRight: 8 }}></span>
                        Looking for agent on localhost:8420…
                    </div>
                )}
                {agentStatus === 'not-found' && (
                    <>
                        <div className="pair-status error">
                            ❌ Agent not found. Make sure it's running on localhost:8420.
                        </div>
                        <p className="pair-hint">
                            Running but still not found? The browser may be blocking this page from
                            reaching <code>127.0.0.1</code>. In Chrome or Edge, allow <b>local network
                            access</b> for this site (the icon left of the address bar). Safari may block an
                            HTTPS page from calling a local agent at all; if so, use Chrome, Edge or Firefox.
                        </p>
                    </>
                )}
                {agentStatus === 'found' && (
                    <>
                        <div className="pair-status success">
                            ✅ Agent detected (v{agentVersion})
                        </div>

                        <div className="form-group" style={{ marginTop: 20 }}>
                            <label>Pairing Code</label>
                            <input
                                className="form-input pair-code-input"
                                type="text"
                                maxLength={6}
                                placeholder="000000"
                                value={code}
                                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                onKeyDown={e => e.key === 'Enter' && handlePair()}
                                autoFocus
                            />
                        </div>

                        {error && <div className="error-msg">{error}</div>}

                        <button
                            className="btn btn-primary"
                            style={{ width: '100%', marginTop: 12 }}
                            onClick={handlePair}
                            disabled={code.length !== 6 || loading}
                        >
                            {loading ? <span className="spinner"></span> : '🔑 Pair'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
