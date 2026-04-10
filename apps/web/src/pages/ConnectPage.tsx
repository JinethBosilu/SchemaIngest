import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ConnectFields } from '../types/schemaPack';
import { useAppStore } from '../store';
import { introspect } from '../api/agentClient';

export default function ConnectPage() {
    const navigate = useNavigate();
    const { setSchemaPack, setConnFields } = useAppStore();
    const [mode, setMode] = useState<'string' | 'fields'>('string');
    const [connString, setConnString] = useState('');
    const [host, setHost] = useState('localhost');
    const [port, setPort] = useState('5432');
    const [dbname, setDbname] = useState('');
    const [user, setUser] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        setLoading(true);
        setError('');

        const fields: ConnectFields = mode === 'string'
            ? { connectionString: connString }
            : { host, port: parseInt(port) || 5432, dbname, user, password };

        try {
            const pack = await introspect(fields);
            setSchemaPack(pack);
            setConnFields(fields);
            navigate('/schema');
        } catch (e: any) {
            setError(e.message || 'Introspection failed');
        } finally {
            setLoading(false);
        }
    };

    const canSubmit = mode === 'string' ? connString.trim().length > 0 : dbname.trim().length > 0;

    return (
        <div className="connect-page">
            <div className="card connect-card">
                <div className="card-header">
                    <h2>🐘 Connect to PostgreSQL</h2>
                    <p>Your credentials are sent only to the local agent — never to any server.</p>
                </div>

                <div className="toggle-group">
                    <button
                        className={mode === 'string' ? 'active' : ''}
                        onClick={() => setMode('string')}
                    >
                        Connection String
                    </button>
                    <button
                        className={mode === 'fields' ? 'active' : ''}
                        onClick={() => setMode('fields')}
                    >
                        Individual Fields
                    </button>
                </div>

                {mode === 'string' ? (
                    <div className="form-group">
                        <label>Connection String</label>
                        <input
                            className="form-input mono"
                            placeholder="postgresql://user:password@localhost:5432/mydb"
                            value={connString}
                            onChange={e => setConnString(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && canSubmit && handleSubmit()}
                            autoFocus
                        />
                    </div>
                ) : (
                    <>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Host</label>
                                <input className="form-input" value={host} onChange={e => setHost(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Port</label>
                                <input className="form-input" value={port} onChange={e => setPort(e.target.value)} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Database Name</label>
                            <input
                                className="form-input"
                                placeholder="mydb"
                                value={dbname}
                                onChange={e => setDbname(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>User</label>
                                <input className="form-input" placeholder="postgres" value={user} onChange={e => setUser(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Password</label>
                                <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} />
                            </div>
                        </div>
                    </>
                )}

                {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}

                <button
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    onClick={handleSubmit}
                    disabled={!canSubmit || loading}
                >
                    {loading ? <><span className="spinner"></span> Introspecting…</> : '🔍 Introspect Schema'}
                </button>
            </div>
        </div>
    );
}
