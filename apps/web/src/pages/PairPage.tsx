import { useState, useEffect } from 'react';
import { detectAgent, pair } from '../api/agentClient';

interface PairPageProps {
    onPaired: () => void;
}

export default function PairPage({ onPaired }: PairPageProps) {
    const [agentStatus, setAgentStatus] = useState<'detecting' | 'found' | 'not-found'>('detecting');
    const [agentVersion, setAgentVersion] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        const check = async () => {
            try {
                const data = await detectAgent();
                if (!cancelled) {
                    setAgentStatus('found');
                    setAgentVersion(data.version);
                }
            } catch {
                if (!cancelled) setAgentStatus('not-found');
            }
        };
        check();
        // Retry every 3s while not found
        const iv = setInterval(() => {
            if (agentStatus === 'not-found' || agentStatus === 'detecting') check();
        }, 3000);
        return () => { cancelled = true; clearInterval(iv); };
    }, [agentStatus]);

    const handlePair = async () => {
        if (code.length !== 6) return;
        setLoading(true);
        setError('');
        try {
            await pair(code);
            onPaired();
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
                    <div className="pair-status error">
                        ❌ Agent not found. Make sure it's running on localhost:8420.
                    </div>
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
