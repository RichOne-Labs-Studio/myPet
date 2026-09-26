import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decryptPhotoUrl, decryptDiagnosticAttachments, encryptPhotoUrl, encryptDiagnosticAttachments } from '../utils/cryptoUtils.ts';
import { normalizePhoneWithZero } from '../utils/phoneUtils.ts';
import { normalizeCageId, sanitizeCagesList } from '../utils/cageUtils.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'clinic_database.json');
const CONFIG_FILE = path.join(DATA_DIR, 'sync_config.json');

export const DEFAULT_WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbyx7QzGHB3gfH-YOXOSWKnAWX3wu_xAoKU6Hiog_vEJUaUg6D14pFiz8j9LgoWVP-A72g/exec';

export interface ServerSyncStatus {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  counts: Record<string, number>;
  version: number;
  lastError: string | null;
  webAppUrl: string;
}

export interface ClinicDatabase {
  owners: any[];
  pets: any[];
  queues: any[];
  soapRecords: any[];
  cages: any[];
  inventory: any[];
  bookings: any[];
  staff: any[];
  feedbacks: any[];
}

const EMPTY_DATABASE: ClinicDatabase = {
  owners: [],
  pets: [],
  queues: [],
  soapRecords: [],
  cages: [],
  inventory: [],
  bookings: [],
  staff: [],
  feedbacks: [],
};

class ServerSyncManager {
  private db: ClinicDatabase = { ...EMPTY_DATABASE };
  private webAppUrl: string = DEFAULT_WEB_APP_URL;
  private autoSync: boolean = true;
  private isSyncing: boolean = false;
  private lastSyncedAt: string | null = null;
  private version: number = 1;
  private lastError: string | null = null;
  private isConnected: boolean = false;
  private pollIntervalId: NodeJS.Timeout | null = null;
  private lastCounts: Record<string, number> = {};
  // Search index/cache: hindari lower-case + Object.values() berulang untuk setiap request.
  private searchTextCache = new Map<string, Map<string, string>>();
  private queryResultCache = new Map<string, { version: number; data: any[]; total: number; totalPages: number }>();
  private readonly QUERY_CACHE_MAX = 250;

  private invalidateQueryCaches(table?: keyof ClinicDatabase) {
    if (!table) {
      this.searchTextCache.clear();
      this.queryResultCache.clear();
      return;
    }
    this.searchTextCache.delete(table);
    for (const key of this.queryResultCache.keys()) {
      if (key.startsWith(String(table) + '|')) this.queryResultCache.delete(key);
    }
  }

  private getSearchText(table: keyof ClinicDatabase, row: any): string {
    const id = String(row?.id ?? '');
    if (!id) return '';
    let tableCache = this.searchTextCache.get(table);
    if (!tableCache) {
      tableCache = new Map<string, string>();
      this.searchTextCache.set(table, tableCache);
    }
    const cached = tableCache.get(id);
    if (cached !== undefined) return cached;

    let text = '';
    if (table === 'pets') {
      text = [
        row.name, row.id, row.breed, row.ownerName,
        row.ownerAddress, row.ownerWhatsapp
      ].map((v) => String(v ?? '').toLowerCase()).join(' ');
    } else {
      text = Object.values(row || {})
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ');
    }
    tableCache.set(id, text);
    return text;
  }

  private getSearchCandidates(table: keyof ClinicDatabase, search: string, source: any[]): any[] {
    // Untuk pencarian pendek/arbitrary substring, tetap gunakan semantics lama.
    // Cache teks membuat operasi jauh lebih murah daripada Object.values() berulang.
    return source.filter((row) => this.getSearchText(table, row).includes(search));
  }

  private setQueryCache(key: string, value: { version: number; data: any[]; total: number; totalPages: number }) {
    if (this.queryResultCache.size >= this.QUERY_CACHE_MAX) {
      const first = this.queryResultCache.keys().next().value;
      if (first) this.queryResultCache.delete(first);
    }
    this.queryResultCache.set(key, value);
  }

  constructor() {
    this.ensureDataDirectory();
    this.loadConfig();
    this.loadDatabaseFromDisk();
  }

  private ensureDataDirectory() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (err: any) {
      console.error('[ServerSync] Gagal membuat direktori data:', err.message);
    }
  }

  private loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.webAppUrl) this.webAppUrl = parsed.webAppUrl;
        if (parsed.autoSync !== undefined) this.autoSync = parsed.autoSync;
      }
    } catch (err: any) {
      console.warn('[ServerSync] Gagal membaca config:', err.message);
    }
  }

  private saveConfig() {
    try {
      this.ensureDataDirectory();
      fs.writeFileSync(
        CONFIG_FILE,
        JSON.stringify({ webAppUrl: this.webAppUrl, autoSync: this.autoSync }, null, 2),
        'utf-8'
      );
    } catch (err: any) {
      console.warn('[ServerSync] Gagal menyimpan config:', err.message);
    }
  }

  private loadDatabaseFromDisk() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        this.db = {
          owners: Array.isArray(parsed.owners) ? parsed.owners : [],
          pets: Array.isArray(parsed.pets) ? parsed.pets : [],
          queues: Array.isArray(parsed.queues) ? parsed.queues : [],
          soapRecords: Array.isArray(parsed.soapRecords) ? parsed.soapRecords : [],
          cages: Array.isArray(parsed.cages) ? parsed.cages : [],
          inventory: Array.isArray(parsed.inventory) ? parsed.inventory : [],
          bookings: Array.isArray(parsed.bookings) ? parsed.bookings : [],
          staff: Array.isArray(parsed.staff) ? parsed.staff : [],
          feedbacks: Array.isArray(parsed.feedbacks) ? parsed.feedbacks : [],
        };
        this.lastSyncedAt = parsed._lastSyncedAt || null;
        this.version = parsed._version || 1;
        this.isConnected = true;
        this.updateCounts();
        console.log(`[ServerSync] Memuat cache disk: ${this.getTotalRecords()} total records.`);
      }
    } catch (err: any) {
      console.warn('[ServerSync] Cache disk kosong atau gagal dibaca:', err.message);
    }
  }

  private saveDatabaseToDisk() {
    try {
      this.ensureDataDirectory();
      const payload = {
        ...this.db,
        _lastSyncedAt: this.lastSyncedAt,
        _version: this.version,
        _counts: this.getCounts(),
      };
      fs.writeFile(DB_FILE, JSON.stringify(payload), 'utf-8', (err) => {
        if (err) console.error('[ServerSync] Gagal menulis ke disk:', err.message);
      });
    } catch (err: any) {
      console.error('[ServerSync] Gagal serialisasi db:', err.message);
    }
  }

  private updateCounts() {
    this.lastCounts = {
      owners: this.db.owners.length,
      pets: this.db.pets.length,
      queues: this.db.queues.length,
      soapRecords: this.db.soapRecords.length,
      cages: this.db.cages.length,
      inventory: this.db.inventory.length,
      bookings: this.db.bookings.length,
      staff: this.db.staff.length,
      feedbacks: this.db.feedbacks.length,
    };
  }

  public getCounts(): Record<string, number> {
    return {
      owners: this.db.owners.length,
      pets: this.db.pets.length,
      queues: this.db.queues.length,
      soapRecords: this.db.soapRecords.length,
      cages: this.db.cages.length,
      inventory: this.db.inventory.length,
      bookings: this.db.bookings.length,
      staff: this.db.staff.length,
      feedbacks: this.db.feedbacks.length,
    };
  }

  public getTotalRecords(): number {
    const c = this.getCounts();
    return Object.values(c).reduce((acc, curr) => acc + curr, 0);
  }

  public getStatus(): ServerSyncStatus {
    return {
      isConnected: this.isConnected,
      isSyncing: this.isSyncing,
      lastSyncedAt: this.lastSyncedAt,
      counts: this.getCounts(),
      version: this.version,
      lastError: this.lastError,
      webAppUrl: this.webAppUrl,
    };
  }

  public getDatabase(): ClinicDatabase {
    return this.db;
  }
  public queryTable(
    table: keyof ClinicDatabase,
    options: { page?: number; limit?: number; search?: string; species?: string; status?: string } = {}
  ): { data: any[]; page: number; limit: number; total: number; totalPages: number } {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 25));
    const search = String(options.search || '').trim().toLowerCase();
    const species = String(options.species || '').trim().toLowerCase();
    const status = String(options.status || '').trim().toLowerCase();

    const cacheKey = [
      String(table), this.version, page, limit,
      search, species, status
    ].join('|');
    const cached = this.queryResultCache.get(cacheKey);
    if (cached && cached.version === this.version) {
      return {
        data: cached.data,
        page,
        limit,
        total: cached.total,
        totalPages: cached.totalPages,
      };
    }

    const source = this.db[table] as any[];
    let filtered = source;

    // Apply selective fields first. This is cheaper than constructing search text
    // for every row when a species/status filter already reduces the candidate set.
    if (table === 'pets' && (species || status)) {
      filtered = source.filter((row) => {
        if (species && String(row.type ?? '').toLowerCase() !== species) return false;
        if (status && String(row.status ?? '').toLowerCase() !== status) return false;
        return true;
      });
    } else if (status) {
      filtered = source.filter((row) =>
        String(row?.status ?? '').toLowerCase() === status
      );
    }

    if (search) {
      const digits = search.replace(/\\D/g, '');
      filtered = filtered.filter((row) => {
        const text = this.getSearchText(table, row);
        if (text.includes(search)) return true;

        // Preserve phone-number search behavior used by DataPasien.
        if (table === 'pets' && digits) {
          return String(row?.ownerWhatsapp ?? '').replace(/\\D/g, '').includes(digits);
        }
        return false;
      });
    }

    const total = filtered.length;
    const start = (page - 1) * limit;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const data = filtered.slice(start, start + limit);

    this.setQueryCache(cacheKey, { version: this.version, data, total, totalPages });

    return { data, page, limit, total, totalPages };
  }

  public setConfig(webAppUrl?: string, autoSync?: boolean) {
    if (webAppUrl && webAppUrl.trim()) {
      this.webAppUrl = webAppUrl.trim();
    }
    if (autoSync !== undefined) {
      this.autoSync = autoSync;
    }
    this.saveConfig();
  }

  /**
   * Tarik database lengkap dari Google Apps Script secara asynchronous di latar belakang (background)
   */
  public async syncFromGoogleSheets(): Promise<boolean> {
    if (this.isSyncing) {
      console.log('[ServerSync] Sinkronisasi sedang berlangsung di latar belakang, abaikan permintaan duplikat.');
      return false;
    }

    if (!this.webAppUrl || !this.webAppUrl.trim()) {
      this.lastError = 'Web App URL belum disetel';
      return false;
    }

    this.isSyncing = true;
    this.lastError = null;
    const startTime = Date.now();
    console.log('[ServerSync] Memulai penarikan data dari Google Sheets...');

    const cleanUrl = this.webAppUrl.trim();
    const fetchUrl = cleanUrl.includes('?')
      ? `${cleanUrl}&action=fetchAll&_t=${Date.now()}`
      : `${cleanUrl}?action=fetchAll&_t=${Date.now()}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout

      const res = await fetch(fetchUrl, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      if (json.status !== 'success' || !json.data) {
        throw new Error(json.message || 'Respons Google Apps Script tidak valid');
      }

      const raw = json.data;

      // Sanitasi & dekripsi data
      const newOwners = Array.isArray(raw.owners) ? raw.owners : [];
      const newPets = (Array.isArray(raw.pets) ? raw.pets : []).map((p: any) => ({
        ...p,
        photoUrl: decryptPhotoUrl(p.photoUrl),
      }));
      const newQueues = (Array.isArray(raw.queues) ? raw.queues : []).map((q: any) => ({
        ...q,
        photoUrl: decryptPhotoUrl(q.photoUrl),
      }));
      const newSoap = (Array.isArray(raw.soapRecords) ? raw.soapRecords : []).map((s: any) => ({
        ...s,
        diagnosticAttachments: decryptDiagnosticAttachments(s.diagnosticAttachments),
      }));
      const newCages = Array.isArray(raw.cages) ? raw.cages : [];
      const newInventory = Array.isArray(raw.inventory) ? raw.inventory : [];
      const newBookings = Array.isArray(raw.bookings) ? raw.bookings : [];
      const newStaff = Array.isArray(raw.staff) ? raw.staff : [];
      const newFeedbacks = Array.isArray(raw.feedbacks) ? raw.feedbacks : [];

      this.db = {
        owners: newOwners,
        pets: newPets,
        queues: newQueues,
        soapRecords: newSoap,
        cages: newCages,
        inventory: newInventory,
        bookings: newBookings,
        staff: newStaff,
        feedbacks: newFeedbacks,
      };

      this.isConnected = true;
      this.lastSyncedAt = new Date().toISOString();
      this.version += 1;
      this.updateCounts();
      this.invalidateQueryCaches();
      this.saveDatabaseToDisk();

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[ServerSync] Berhasil sinkron dari Google Sheets dalam ${duration} detik! Total: ${this.getTotalRecords()} baris.`
      );
      return true;
    } catch (err: any) {
      this.lastError = err.message || 'Gagal sinkron';
      console.error('[ServerSync] Kesalahan penarikan data Google Sheets:', this.lastError);
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Upsert single record ke memory & disk seketika, lalu kirim ke Google Sheets di background (O(1))
   */
  public async upsertRecord(table: keyof ClinicDatabase, record: any): Promise<number> {
    if (!record || typeof record !== 'object') return this.version;

    const list = this.db[table] as any[];
    const id = record.id;
    let foundIndex = -1;

    if (id !== undefined && id !== null && id !== '') {
      foundIndex = list.findIndex((item) => String(item.id) === String(id));
    }

    if (foundIndex >= 0) {
      list[foundIndex] = { ...list[foundIndex], ...record };
    } else {
      list.unshift(record);
    }

    this.version += 1;
    this.invalidateQueryCaches(table);
    this.saveDatabaseToDisk();

    // Push ke Google Apps Script di background tanpa memblokir response
    this.pushSingleRecordToAppsScript(table, record).catch((err) => {
      console.warn(`[ServerSync] Gagal push record (${table}) ke Google Sheets:`, err.message);
    });

    return this.version;
  }

  /**
   * Hapus single record dari memory & disk
   */
  public async deleteRecord(table: keyof ClinicDatabase, id: string): Promise<number> {
    const list = this.db[table] as any[];
    this.db[table] = list.filter((item) => String(item.id) !== String(id));
    this.version += 1;
    this.invalidateQueryCaches(table);
    this.saveDatabaseToDisk();
    return this.version;
  }

  /**
   * Push single record langsung ke Google Apps Script (asynchronous)
   */
  private async pushSingleRecordToAppsScript(table: keyof ClinicDatabase, record: any): Promise<void> {
    if (!this.webAppUrl || !this.webAppUrl.trim()) return;

    let recordToPush = { ...record };
    if ('whatsapp' in recordToPush && recordToPush.whatsapp) {
      recordToPush.whatsapp = normalizePhoneWithZero(recordToPush.whatsapp);
    }
    if ('ownerWhatsapp' in recordToPush && recordToPush.ownerWhatsapp) {
      recordToPush.ownerWhatsapp = normalizePhoneWithZero(recordToPush.ownerWhatsapp);
    }
    if (table === 'pets' && 'photoUrl' in recordToPush) {
      recordToPush.photoUrl = encryptPhotoUrl(recordToPush.photoUrl);
    }
    if (table === 'queues' && 'photoUrl' in recordToPush) {
      recordToPush.photoUrl = encryptPhotoUrl(recordToPush.photoUrl);
    }
    if (table === 'soapRecords' && 'diagnosticAttachments' in recordToPush) {
      recordToPush.diagnosticAttachments = encryptDiagnosticAttachments(recordToPush.diagnosticAttachments);
    }
    if (table === 'cages') {
      recordToPush.id = normalizeCageId(recordToPush.id, recordToPush.label) || recordToPush.id;
    }

    const payload = JSON.stringify({
      action: 'upsert',
      table: table,
      record: recordToPush,
      timestamp: new Date().toISOString(),
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(this.webAppUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: payload,
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[ServerSync] Apps script response error: HTTP ${res.status}`);
    }
  }

  /**
   * Update seluruh tabel (misal urutan antrean atau status kandang)
   */
  public async updateTable(table: keyof ClinicDatabase, records: any[]): Promise<number> {
    this.db[table] = records;
    this.version += 1;
    this.invalidateQueryCaches(table);
    this.saveDatabaseToDisk();

    // Push tabel ke Google Sheets di background
    this.pushTableToAppsScript(table, records).catch((err) => {
      console.warn(`[ServerSync] Gagal push tabel (${table}) ke Google Sheets:`, err.message);
    });

    return this.version;
  }

  private async pushTableToAppsScript(table: keyof ClinicDatabase, records: any[]): Promise<void> {
    if (!this.webAppUrl || !this.webAppUrl.trim()) return;

    const targetRecords = table === 'cages' ? sanitizeCagesList(records) : records;
    const sanitizedRecords = targetRecords.map((rec) => {
      if (!rec || typeof rec !== 'object') return rec;
      const copy = { ...rec };
      if ('whatsapp' in copy && copy.whatsapp) copy.whatsapp = normalizePhoneWithZero(copy.whatsapp);
      if ('ownerWhatsapp' in copy && copy.ownerWhatsapp) copy.ownerWhatsapp = normalizePhoneWithZero(copy.ownerWhatsapp);
      if (table === 'pets' && 'photoUrl' in copy) copy.photoUrl = encryptPhotoUrl(copy.photoUrl);
      if (table === 'queues' && 'photoUrl' in copy) copy.photoUrl = encryptPhotoUrl(copy.photoUrl);
      if (table === 'soapRecords' && 'diagnosticAttachments' in copy) {
        copy.diagnosticAttachments = encryptDiagnosticAttachments(copy.diagnosticAttachments);
      }
      if (table === 'cages') copy.id = normalizeCageId(copy.id, copy.label) || copy.id;
      return copy;
    });

    const payload = JSON.stringify({
      action: 'syncAll',
      timestamp: new Date().toISOString(),
      data: { [table]: sanitizedRecords },
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    await fetch(this.webAppUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: payload,
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeoutId);
  }

  /**
   * Jalankan worker polling otomatis di background
   */
  public startBackgroundWorker() {
    // 1. Jalankan initial pull seketika saat server boot
    this.syncFromGoogleSheets().catch(() => {});

    // 2. Loop polling ping setiap 30 detik
    if (this.pollIntervalId) clearInterval(this.pollIntervalId);

    this.pollIntervalId = setInterval(async () => {
      if (!this.autoSync || this.isSyncing) return;

      try {
        const pingUrl = this.webAppUrl.includes('?')
          ? `${this.webAppUrl}&action=ping&_t=${Date.now()}`
          : `${this.webAppUrl}?action=ping&_t=${Date.now()}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(pingUrl, { signal: controller.signal, redirect: 'follow' });
        clearTimeout(timeout);

        if (!res.ok) return;
        const json = await res.json();

        if (json.status === 'success' && json.counts) {
          const currentCounts = this.getCounts();
          let changed = false;

          for (const key of Object.keys(json.counts)) {
            if (json.counts[key] !== (currentCounts as any)[key]) {
              changed = true;
              break;
            }
          }

          if (changed) {
            console.log('[ServerSync] Deteksi perubahan baris di Google Sheets, memulai sinkronisasi otomatis...');
            await this.syncFromGoogleSheets();
          }
        }
      } catch (err: any) {
        // Abaikan kesalahan ping sesaat
      }
    }, 30000);
  }

  public stopBackgroundWorker() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }
}

export const syncManager = new ServerSyncManager();
