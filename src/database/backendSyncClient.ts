/**
 * Client-side interface to connect to Backend Sync Engine.
 * 
 * Instead of browser fetching 100k+ rows directly from Google Apps Script (slow, CORS, 50s timeouts),
 * the browser connects to the local Express backend in <10ms.
 * The backend handles real-time background sync with Google Sheets automatically.
 */

import { SpreadsheetDatabaseSchema } from './spreadsheetDb';

export interface BackendSyncStatus {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  counts: Record<string, number>;
  version: number;
  lastError: string | null;
  webAppUrl?: string;
}

export async function fetchDatabaseFromBackend(): Promise<{
  success: boolean;
  data?: SpreadsheetDatabaseSchema;
  status?: BackendSyncStatus;
  message?: string;
}> {
  try {
    const res = await fetch('/api/sync/data', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return { success: false, message: `Server error: ${res.status}` };
    }

    const json = await res.json();
    if (json.success && json.data) {
      return {
        success: true,
        data: json.data,
        status: json.status,
      };
    }

    return { success: false, message: json.message || 'Gagal memuat data' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Koneksi ke backend gagal' };
  }
}

export async function fetchStatusFromBackend(): Promise<BackendSyncStatus | null> {
  try {
    const res = await fetch('/api/sync/status', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json : null;
  } catch {
    return null;
  }
}

export async function triggerBackendSync(): Promise<boolean> {
  try {
    const res = await fetch('/api/sync/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function pushRecordToBackend(table: string, record: any): Promise<boolean> {
  try {
    const res = await fetch('/api/sync/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, record }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteRecordFromBackend(table: string, id: string): Promise<boolean> {
  try {
    const res = await fetch('/api/sync/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, id }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function pushTableToBackend(table: string, records: any[]): Promise<boolean> {
  try {
    const res = await fetch('/api/sync/table', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, records }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function updateBackendConfig(webAppUrl?: string, autoSync?: boolean): Promise<boolean> {
  try {
    const res = await fetch('/api/sync/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webAppUrl, autoSync }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
