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

/** The agent no longer knows our token - it was restarted, or the session expired. */
export class SessionExpiredError extends Error {}

async function handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        const message = body.detail || `HTTP ${res.status}`;
        if (res.status === 401) throw new SessionExpiredError(message);
        throw new Error(message);
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
 * The browser's permission for this page to reach the agent on 127.0.0.1.
 *
 * Chrome gates a public site's requests to your own machine behind a "local
 * network access" permission; while it is denied, fetch fails before anything
 * is sent, which looks exactly like the agent not running. The permission's
 * name has changed between Chrome versions, so both are tried. Null where the
 * browser has no such permission or will not say (Firefox, Safari).
 */
export async function localNetworkPermission(): Promise<PermissionStatus | null> {
    if (!navigator.permissions?.query) return null;
    for (const name of ['loopback-network', 'local-network-access']) {
        try {
            return await navigator.permissions.query({ name: name as PermissionName });
        } catch {
            // Not a permission this browser knows; try the next name.
        }
    }
    return null;
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
 * Introspect a PostgreSQL or MySQL/MariaDB database and return the full schema pack.
 */
export async function introspect(fields: ConnectFields): Promise<SchemaPack> {
    const res = await fetch(`${AGENT_BASE}/introspect`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(fields),
    });
    return handleResponse<SchemaPack>(res);
}
