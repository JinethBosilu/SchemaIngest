import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { detectAgent, localNetworkPermission, pair } from '../api/agentClient';
import { useAppStore } from '../store';

export default function PairPage() {
    const navigate = useNavigate();
    const { setIsPaired } = useAppStore();
    const [agentStatus, setAgentStatus] = useState<'detecting' | 'found' | 'not-found' | 'blocked'>('detecting');
    const [agentVersion, setAgentVersion] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Look for the agent now, then every 3s until it answers. A failed fetch
    // is either no agent or the browser refusing to reach 127.0.0.1 at all;
    // the local-network permission tells the two apart where the browser says.
    useEffect(() => {
        let cancelled = false;
        let timer: number | undefined;
        let permission: PermissionStatus | null = null;
        const check = async () => {
            window.clearTimeout(timer);
            try {
                const data = await detectAgent();
                if (cancelled) return;
                setAgentStatus('found');
                setAgentVersion(data.version);
            } catch {
                if (cancelled) return;
                setAgentStatus(permission?.state === 'denied' ? 'blocked' : 'not-found');
                timer = window.setTimeout(check, 3000);
            }
        };
        localNetworkPermission().then(p => {
            if (cancelled) return;
            permission = p;
            // Allowing access in site settings retries at once, not on the next poll.
            if (p) p.onchange = check;
            check();
        });
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
            if (permission) permission.onchange = null;
        };
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
        <div className="form-page">
            <section className="sheet">
                <div className="sheet-head">
                    <h1>Pair with the agent</h1>
                    <p>
                        Run <code>schemaingest agent</code> on this computer, then enter the
                        6-digit code it prints.
                    </p>
                </div>

                <div className="sheet-body">
                    {agentStatus === 'detecting' && (
                        <div className="note" role="status">
                            <span className="spinner" aria-hidden="true"></span>
                            Looking for the agent on localhost:8420…
                        </div>
                    )}
                    {agentStatus === 'blocked' && (
                        <>
                            <div className="note caution" role="alert">
                                Your browser is blocking this page from reaching the agent on this computer.
                            </div>
                            <ol className="hint">
                                <li>Click the icon left of the address bar, then <b>Site settings</b>.</li>
                                <li>Set <b>Local network access</b> to <b>Allow</b> (some versions call it <b>Apps on device</b>).</li>
                                <li>Come back to this tab. It connects as soon as access is allowed.</li>
                            </ol>
                        </>
                    )}
                    {agentStatus === 'not-found' && (
                        <>
                            <div className="note alert" role="status">
                                No agent on localhost:8420. Start it with <code>schemaingest agent</code>; this
                                page checks again every few seconds.
                            </div>
                            <p className="hint">
                                Running but still not found? The browser may be blocking this page from
                                reaching <code>127.0.0.1</code>. In Chrome or Edge, allow <b>local network
                                access</b> for this site (the icon left of the address bar). Safari may block an
                                HTTPS page from calling a local agent at all; if so, use Chrome, Edge or Firefox.
                            </p>
                        </>
                    )}
                    {agentStatus === 'found' && (
                        <>
                            <div className="note ok" role="status">Found agent v{agentVersion}.</div>

                            <div className="form-group form-actions">
                                <label htmlFor="pair-code">Pairing code</label>
                                <input
                                    id="pair-code"
                                    className="form-input pair-code-input"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    placeholder="000000"
                                    value={code}
                                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    onKeyDown={e => e.key === 'Enter' && handlePair()}
                                    autoFocus
                                />
                            </div>

                            {error && <div className="note alert" role="alert">{error}</div>}

                            <div className="form-actions">
                                <button
                                    type="button"
                                    className="btn btn-primary btn-block"
                                    onClick={handlePair}
                                    disabled={code.length !== 6 || loading}
                                >
                                    {loading && <span className="spinner" aria-hidden="true"></span>}
                                    {loading ? 'Pairing…' : 'Pair'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </section>
        </div>
    );
}
