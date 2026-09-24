import { useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ConnectFields, Engine } from '../types/schemaPack';
import { useAppStore } from '../store';
import { clearSession, introspect, SessionExpiredError } from '../api/agentClient';

const ENGINES: Record<Engine, { label: string; port: string; user: string; placeholder: string }> = {
    postgresql: {
        label: 'PostgreSQL',
        port: '5432',
        user: 'postgres',
        placeholder: 'postgresql://user:password@localhost:5432/mydb',
    },
    mysql: {
        label: 'MySQL / MariaDB',
        port: '3306',
        user: 'root',
        placeholder: 'mysql://user:password@localhost:3306/mydb',
    },
};

/** The engine a pasted connection string names, if it names one. */
function engineOf(conn: string): Engine | null {
    const s = conn.trim().toLowerCase();
    if (s.startsWith('mysql://') || s.startsWith('mariadb://')) return 'mysql';
    if (s.startsWith('postgresql://') || s.startsWith('postgres://')) return 'postgresql';
    return null;
}

export default function ConnectPage() {
    const navigate = useNavigate();
    const { setSchemaPack, clearSessionData } = useAppStore();
    const [engine, setEngine] = useState<Engine>('postgresql');
    const [mode, setMode] = useState<'string' | 'fields'>('string');
    const [connString, setConnString] = useState('');
    const [host, setHost] = useState('localhost');
    const [port, setPort] = useState(ENGINES.postgresql.port);
    const [dbname, setDbname] = useState('');
    const [user, setUser] = useState('');
    const [password, setPassword] = useState('');
    const [schema, setSchema] = useState('public');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const eng = ENGINES[engine];

    const switchEngine = (next: Engine) => {
        if (next === engine) return;
        // Carry the port across only if it is not just the other engine's default.
        if (port === eng.port) setPort(ENGINES[next].port);
        setEngine(next);
        setError('');
    };

    const onConnString = (value: string) => {
        setConnString(value);
        const named = engineOf(value);
        if (named) switchEngine(named);
    };

    const handleSubmit = async () => {
        setLoading(true);
        setError('');

        const fields: ConnectFields = mode === 'string'
            ? { connectionString: connString }
            : { host, port: parseInt(port) || parseInt(eng.port), dbname, user, password };
        fields.engine = engine;
        // In MySQL the database is the schema; the agent takes it from there.
        if (engine === 'postgresql') fields.schema = schema.trim() || 'public';

        try {
            const pack = await introspect(fields);
            setSchemaPack(pack);
            navigate('/schema');
        } catch (e: any) {
            if (e instanceof SessionExpiredError) {
                // The agent was restarted and has a new pairing code.
                clearSession();
                clearSessionData();
                navigate('/');
                return;
            }
            setError(e.message || 'Introspection failed');
        } finally {
            setLoading(false);
        }
    };

    const canSubmit = mode === 'string' ? connString.trim().length > 0 : dbname.trim().length > 0;
    const submitOnEnter = (e: KeyboardEvent) => e.key === 'Enter' && canSubmit && handleSubmit();

    return (
        <div className="connect-page">
            <div className="card connect-card">
                <div className="card-header">
                    <h2>{engine === 'mysql' ? '🐬' : '🐘'} Connect to your database</h2>
                    <p>Your credentials are sent only to the local agent — never to any server.</p>
                </div>

                <div className="toggle-group" role="tablist" aria-label="Database engine">
                    {(Object.keys(ENGINES) as Engine[]).map(k => (
                        <button
                            key={k}
                            role="tab"
                            aria-selected={engine === k}
                            className={engine === k ? 'active' : ''}
                            onClick={() => switchEngine(k)}
                        >
                            {ENGINES[k].label}
                        </button>
                    ))}
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
                            placeholder={eng.placeholder}
                            value={connString}
                            onChange={e => onConnString(e.target.value)}
                            onKeyDown={submitOnEnter}
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
                                onKeyDown={submitOnEnter}
                                autoFocus
                            />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>User</label>
                                <input className="form-input" placeholder={eng.user} value={user} onChange={e => setUser(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Password</label>
                                <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} />
                            </div>
                        </div>
                    </>
                )}

                {engine === 'postgresql' && (
                    <div className="form-group">
                        <label>Schema</label>
                        <input
                            className="form-input mono"
                            placeholder="public"
                            value={schema}
                            onChange={e => setSchema(e.target.value)}
                            onKeyDown={submitOnEnter}
                        />
                    </div>
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
