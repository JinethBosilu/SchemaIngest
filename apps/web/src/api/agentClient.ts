/**
 * Agent Client — HTTP calls to the local SchemaIngest agent.
 *
 * The agent runs on http://127.0.0.1:8420 (localhost only).
 * All credential data is sent only to localhost — never to any remote server.
 */

import type { SchemaPack, ConnectFields } from '../types/schemaPack';

const AGENT_BASE = 'http://127.0.0.1:8420';

let _sessionToken: string | null = sessionStorage.getItem('agentSessionToken');

// ─── Helpers ─────────────────────────────────────────────

function authHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_sessionToken) {
        headers['Authorization'] = `Bearer ${_sessionToken}`;
    }
    return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body.detail || `HTTP ${res.status}`);
    }
    return res.json();
}

// ─── Public API ──────────────────────────────────────────

export function getSessionToken(): string | null {
    return _sessionToken;
}

export function clearSession(): void {
    _sessionToken = null;
    sessionStorage.removeItem('agentSessionToken');
}

/**
 * Check if the agent is reachable.
 */
export async function detectAgent(): Promise<{ status: string; version: string }> {
    const res = await fetch(`${AGENT_BASE}/health`, { method: 'GET' });
    return handleResponse(res);
}

/**
 * Pair with the agent using the 6-digit code shown in the terminal.
 * On success, stores the session token for subsequent requests.
 */
export async function pair(code: string): Promise<string> {
    const res = await fetch(`${AGENT_BASE}/pair/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
    });
    const data = await handleResponse<{ sessionToken: string }>(res);
    _sessionToken = data.sessionToken;
    sessionStorage.setItem('agentSessionToken', data.sessionToken);
    return data.sessionToken;
}

/**
 * Introspect a Postgres database and return the full schema pack.
 */
export async function introspect(fields: ConnectFields): Promise<SchemaPack> {
    const res = await fetch(`${AGENT_BASE}/introspect`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(fields),
    });
    return handleResponse<SchemaPack>(res);
}

/**
 * Get AI-friendly schema text.
 */
export async function getSchemaText(fields: ConnectFields): Promise<string> {
    const res = await fetch(`${AGENT_BASE}/render/schema.txt`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(fields),
    });
    const data = await handleResponse<{ text: string }>(res);
    return data.text;
}

/**
 * Get Mermaid ERD diagram text.
 */
export async function getErdMermaid(fields: ConnectFields): Promise<string> {
    const res = await fetch(`${AGENT_BASE}/render/erd.mmd`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(fields),
    });
    const data = await handleResponse<{ mermaid: string }>(res);
    return data.mermaid;
}
