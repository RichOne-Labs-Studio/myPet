import {
  Owner,
  Pet,
  VisitQueue,
  SoapRecord,
  InpatientCage,
  InventoryItem,
  BookingAppointment,
  StaffUser,
  CustomerFeedback,
  SpreadsheetConfig
} from '../types';
import { normalizePhoneWithZero } from '../utils/phoneUtils';
import {
  encryptPhotoUrl,
  decryptPhotoUrl,
  encryptDiagnosticAttachments,
  decryptDiagnosticAttachments
} from '../utils/cryptoUtils';
import { normalizeCageId, sanitizeCagesList } from '../utils/cageUtils';

export interface SpreadsheetDatabaseSchema {
  owners: Owner[];
  pets: Pet[];
  queues: VisitQueue[];
  soapRecords: SoapRecord[];
  cages: InpatientCage[];
  inventory: InventoryItem[];
  bookings: BookingAppointment[];
  staff: StaffUser[];
  feedbacks: CustomerFeedback[];
}

export const FINAL_SPREADSHEET_URL =
  'https://script.google.com/macros/s/AKfycbyx7QzGHB3gfH-YOXOSWKnAWX3wu_xAoKU6Hiog_vEJUaUg6D14pFiz8j9LgoWVP-A72g/exec';

export const DEFAULT_SPREADSHEET_CONFIG: SpreadsheetConfig = {
  webAppUrl: FINAL_SPREADSHEET_URL,
  spreadsheetName: 'Vier Pet Care - Database Klinik',
  autoSync: true,
  isConnected: true,
};

// ==========================================
// CSV UTILITIES (EXPORT & IMPORT)
// ==========================================

export function objectsToCSV<T extends Record<string, any>>(data: T[]): string {
  if (!data || data.length === 0) return '';
  const keys = Object.keys(data[0]);
  const header = keys.join(',');
  const rows = data.map((item) =>
    keys
      .map((key) => {
        let val = item[key];
        if (val === null || val === undefined) val = '';
        if (typeof val === 'object') {
          val = JSON.stringify(val);
        }
        val = String(val).replace(/"/g, '""');
        if (val.includes(',') || val.includes('\n') || val.includes('"')) {
          val = `"${val}"`;
        }
        return val;
      })
      .join(',')
  );
  return [header, ...rows].join('\n');
}

export function csvToObjects<T = Record<string, any>>(csvString: string): T[] {
  if (!csvString || !csvString.trim()) return [];
  const lines = csvString.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse header line
  const headers = parseCSVLine(lines[0]);
  const results: T[] = [];

  for (let i = 1; i < lines.length; i++) {
    const currentLine = lines[i].trim();
    if (!currentLine) continue;
    const values = parseCSVLine(currentLine);
    const obj: Record<string, any> = {};

    headers.forEach((header, index) => {
      let val: any = values[index] ?? '';
      // Try to parse JSON objects or arrays
      if (typeof val === 'string' && ((val.startsWith('{') && val.endsWith('}')) || (val.startsWith('[') && val.endsWith(']')))) {
        try {
          val = JSON.parse(val);
        } catch {
          // Keep as string
        }
      }
      obj[header] = val;
    });

    results.push(obj as T);
  }

  return results;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function downloadCSV(csvContent: string, fileName: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportDatabaseAsSpreadsheets(db: SpreadsheetDatabaseSchema) {
  downloadCSV(objectsToCSV(db.owners), 'VierPetCare_Sheet_1_Pemilik.csv');
  setTimeout(() => downloadCSV(objectsToCSV(db.pets), 'VierPetCare_Sheet_2_Pasien.csv'), 200);
  setTimeout(() => downloadCSV(objectsToCSV(db.queues), 'VierPetCare_Sheet_3_Antrean.csv'), 400);
  setTimeout(() => downloadCSV(objectsToCSV(db.soapRecords), 'VierPetCare_Sheet_4_RekamMedis.csv'), 600);
  setTimeout(() => downloadCSV(objectsToCSV(db.cages), 'VierPetCare_Sheet_5_RawatInap.csv'), 800);
  setTimeout(() => downloadCSV(objectsToCSV(db.inventory), 'VierPetCare_Sheet_6_StokObat.csv'), 1000);
  setTimeout(() => downloadCSV(objectsToCSV(db.bookings), 'VierPetCare_Sheet_7_Booking.csv'), 1200);
  setTimeout(() => downloadCSV(objectsToCSV(db.staff), 'VierPetCare_Sheet_8_Staf.csv'), 1400);
  setTimeout(() => downloadCSV(objectsToCSV(db.feedbacks || []), 'VierPetCare_Sheet_9_KepuasanSaran.csv'), 1600);
}

// ==========================================
// GOOGLE SHEETS / APPS SCRIPT WEB APP INTEGRATION
// ==========================================

export async function testSpreadsheetConnection(webAppUrl: string): Promise<{
  success: boolean;
  message: string;
  tables?: string[];
  counts?: Record<string, number>;
}> {
  if (!webAppUrl || !webAppUrl.trim()) {
    return { success: false, message: 'URL Google Apps Script Web App belum diisi.' };
  }

  const cleanUrl = webAppUrl.trim();
  const testUrl = cleanUrl.includes('?')
    ? `${cleanUrl}&action=ping&_t=${Date.now()}`
    : `${cleanUrl}?action=ping&_t=${Date.now()}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(testUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        success: false,
        message: `HTTP Error: ${res.status} (${res.statusText}). Pastikan deployment disetel ke "Anyone".`,
      };
    }

    const data = await res.json();
    if (data.status === 'success' || data.connected || data.tables) {
      return {
        success: true,
        message: 'Koneksi ke Google Spreadsheet berhasil terhubung!',
        tables: data.tables || ['Pemilik', 'Pasien', 'Antrean', 'RekamMedis', 'RawatInap', 'StokObat', 'Booking', 'Staf', 'KepuasanSaran'],
        counts: data.counts,
      };
    }

    return {
      success: true,
      message: 'Koneksi terhubung (respon diterima).',
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, message: 'Koneksi timeout (lebih dari 12 detik). Periksa URL Web App Anda.' };
    }
    return {
      success: false,
      message: `Gagal menghubungi Spreadsheet: ${err.message || 'Periksa URL Web App dan izin akses (Anyone).'}`
    };
  }
}

export function decryptDatabaseFromSpreadsheet(db: Partial<SpreadsheetDatabaseSchema>): SpreadsheetDatabaseSchema {
  return {
    ...db,
    pets: db.pets?.map((p) => ({
      ...p,
      photoUrl: decryptPhotoUrl(p.photoUrl),
    })),
    queues: db.queues?.map((q) => ({
      ...q,
      photoUrl: decryptPhotoUrl(q.photoUrl),
    })),
    soapRecords: db.soapRecords?.map((s) => ({
      ...s,
      diagnosticAttachments: decryptDiagnosticAttachments(s.diagnosticAttachments),
    })),
  } as SpreadsheetDatabaseSchema;
}

export async function pullFullDatabaseFromSpreadsheet(webAppUrl: string): Promise<{
  success: boolean;
  message: string;
  data?: SpreadsheetDatabaseSchema;
}> {
  if (!webAppUrl || !webAppUrl.trim()) {
    return { success: false, message: 'URL Google Apps Script belum dikonfigurasi.' };
  }

  const cleanUrl = webAppUrl.trim();
  const fetchUrl = cleanUrl.includes('?')
    ? `${cleanUrl}&action=fetchAll&_t=${Date.now()}`
    : `${cleanUrl}?action=fetchAll&_t=${Date.now()}`;

  const attemptFetch = async (): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout to allow large 100k+ row transfers
    try {
      return await fetch(fetchUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    let res: Response;
    try {
      res = await attemptFetch();
    } catch (err: any) {
      // Retry once — Apps Script "cold start" bisa melebihi timeout pertama
      if (err.name === 'AbortError') {
        res = await attemptFetch();
      } else {
        throw err;
      }
    }

    if (!res.ok) {
      return { success: false, message: `Gagal mengambil data (HTTP ${res.status}).` };
    }

    const json = await res.json();
    if (json && json.status === 'success' && json.data) {
      const decryptedData = decryptDatabaseFromSpreadsheet(json.data);
      return {
        success: true,
        message: 'Data seluruh sheet berhasil ditarik dari Google Spreadsheet.',
        data: decryptedData,
      };
    } else if (json && json.owners !== undefined) {
      const decryptedData = decryptDatabaseFromSpreadsheet(json);
      return {
        success: true,
        message: 'Data berhasil ditarik dari Spreadsheet.',
        data: decryptedData,
      };
    }

    return {
      success: false,
      message: json.message || 'Format data dari Google Apps Script tidak sesuai.',
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, message: 'Koneksi timeout setelah 2x percobaan (120 detik). Apps Script memerlukan waktu lebih lama karena volume data yang sangat besar.' };
    }
    return {
      success: false,
      message: `Error penarikan data: ${err.message || 'Koneksi terputus'}`,
    };
  }
}

/**
 * Tarik data spesifik satu tabel dengan paging / chunking opsional
 * Menghindari beban berlebih saat data per sheet mencapai puluhan ribu baris.
 */
export async function queryTableFromSpreadsheet(
  webAppUrl: string,
  table: keyof SpreadsheetDatabaseSchema,
  options: { page?: number; limit?: number; search?: string; species?: string; status?: string } = {}
): Promise<{ success: boolean; message: string; data?: any[]; total?: number; page?: number; limit?: number; totalPages?: number }> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 10));

  // Prefer the Node backend when the app is running with its API server.
  // GitHub Pages has no /api endpoint, so it transparently falls back to Apps Script.
  try {
    const params = new URLSearchParams({
      table: String(table),
      page: String(page),
      limit: String(limit),
    });
    if (options.search) params.set('search', options.search);
    if (options.species) params.set('species', options.species);
    if (options.status) params.set('status', options.status);

    const apiRes = await fetch(`/api/sync/query?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (apiRes.ok) {
      const json = await apiRes.json();
      if (json.success && Array.isArray(json.data)) return json;
    }
  } catch {
    // Static hosting / unavailable backend: use Apps Script below.
  }

  return pullTableFromSpreadsheet(webAppUrl, table, (page - 1) * limit, limit, {
    search: options.search || '',
    species: options.species || '',
    status: options.status || ''
  });
}

export async function pullTableFromSpreadsheet(
  webAppUrl: string,
  table: keyof SpreadsheetDatabaseSchema,
  offset: number = 0,
  limit?: number,
  filters: { search?: string; species?: string; status?: string } = {}
): Promise<{ success: boolean; message: string; data?: any[]; total?: number; page?: number; limit?: number; totalPages?: number }> {
  if (!webAppUrl || !webAppUrl.trim()) {
    return { success: false, message: 'URL Google Apps Script belum dikonfigurasi.' };
  }

  const cleanUrl = webAppUrl.trim();
  let fetchUrl = cleanUrl.includes('?')
    ? `${cleanUrl}&action=fetchTable&table=${table}&offset=${offset}&_t=${Date.now()}`
    : `${cleanUrl}?action=fetchTable&table=${table}&offset=${offset}&_t=${Date.now()}`;

  if (limit) {
    fetchUrl += `&limit=${limit}`;
  }
  if (filters.search) fetchUrl += `&search=${encodeURIComponent(filters.search)}`;
  if (filters.species) fetchUrl += `&species=${encodeURIComponent(filters.species)}`;
  if (filters.status) fetchUrl += `&status=${encodeURIComponent(filters.status)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const res = await fetch(fetchUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, message: `Gagal menarik tabel ${table} (HTTP ${res.status})` };
    }

    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      let records = json.data;
      if (table === 'pets') {
        records = records.map((p: any) => ({ ...p, photoUrl: decryptPhotoUrl(p.photoUrl) }));
      } else if (table === 'queues') {
        records = records.map((q: any) => ({ ...q, photoUrl: decryptPhotoUrl(q.photoUrl) }));
      } else if (table === 'soapRecords') {
        records = records.map((s: any) => ({ ...s, diagnosticAttachments: decryptDiagnosticAttachments(s.diagnosticAttachments) }));
      }
      return {
        success: true,
        message: `Tabel ${table} berhasil ditarik`,
        data: records,
        total: Number(json.total ?? json.count ?? records.length),
        page: Number(json.page ?? Math.floor(offset / (limit || records.length || 1)) + 1),
        limit: Number(json.limit ?? limit ?? records.length),
        totalPages: Number(json.totalPages ?? 0) || Math.max(1, Math.ceil(Number(json.total ?? json.count ?? records.length) / Number(json.limit ?? limit ?? records.length || 1))),
      };
    }

    return { success: false, message: json.message || 'Format tidak sesuai' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal koneksi tabel' };
  }
}

export async function pushFullDatabaseToSpreadsheet(
  webAppUrl: string,
  db: SpreadsheetDatabaseSchema
): Promise<{
  success: boolean;
  message: string;
}> {
  if (!webAppUrl || !webAppUrl.trim()) {
    return { success: false, message: 'URL Google Apps Script belum dikonfigurasi.' };
  }

  const cleanUrl = webAppUrl.trim();

  try {
    // Ensure phone numbers start with '0' and photos/diagnostic attachments are stored encrypted
    const sanitizedDb = {
      ...db,
      owners: db.owners?.map((o) => ({ ...o, whatsapp: normalizePhoneWithZero(o.whatsapp) })),
      pets: db.pets?.map((p) => ({
        ...p,
        ownerWhatsapp: normalizePhoneWithZero(p.ownerWhatsapp),
        photoUrl: encryptPhotoUrl(p.photoUrl),
      })),
      queues: db.queues?.map((q) => ({
        ...q,
        ownerWhatsapp: normalizePhoneWithZero(q.ownerWhatsapp),
        photoUrl: encryptPhotoUrl(q.photoUrl),
      })),
      soapRecords: db.soapRecords?.map((s) => ({
        ...s,
        diagnosticAttachments: encryptDiagnosticAttachments(s.diagnosticAttachments) as any,
      })),
      feedbacks: db.feedbacks?.map((f) => ({
        ...f,
        ownerWhatsapp: f.ownerWhatsapp ? normalizePhoneWithZero(f.ownerWhatsapp) : f.ownerWhatsapp,
      })),
      cages: sanitizeCagesList(db.cages || []).map((c) => ({
        ...c,
        id: normalizeCageId(c.id, c.label) || c.id,
        ownerWhatsapp: c.ownerWhatsapp ? normalizePhoneWithZero(c.ownerWhatsapp) : c.ownerWhatsapp,
      })),
    };

    // We send payload as text/plain to avoid browser CORS preflight blocks with Google Apps Script
    const payload = JSON.stringify({
      action: 'syncAll',
      timestamp: new Date().toISOString(),
      data: sanitizedDb,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 40000);

    const res = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, message: `Gagal mengirim data (HTTP ${res.status}).` };
    }

    const result = await res.json().catch(() => ({ status: 'success' }));
    return {
      success: true,
      message: result.message || 'Semua sheet di Google Spreadsheet berhasil diperbarui!',
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, message: 'Koneksi timeout (lebih dari 40 detik). Data mungkin terlalu besar untuk sinkron penuh — coba lagi atau kurangi data lama.' };
    }
    return {
      success: false,
      message: `Gagal mengirim data ke Spreadsheet: ${err.message || 'Koneksi error'}`,
    };
  }
}

/**
 * Push HANYA satu tabel/sheet (bukan seluruh database). Dipakai oleh auto-sync
 * per-tabel supaya 1 perubahan kecil tidak memicu tulis-ulang semua 9 sheet.
 * Memakai action yang sama ('syncAll') tapi payload 'data' hanya berisi 1 key,
 * sehingga di sisi Apps Script hanya sheet tabel ini yang di-clear & ditulis ulang.
 */
export async function pushTableToSpreadsheet(
  webAppUrl: string,
  table: keyof SpreadsheetDatabaseSchema,
  records: any[]
): Promise<{ success: boolean; message: string }> {
  if (!webAppUrl || !webAppUrl.trim()) {
    return { success: false, message: 'URL Google Apps Script belum dikonfigurasi.' };
  }

  const cleanUrl = webAppUrl.trim();

  try {
    const targetRecords = table === 'cages' ? sanitizeCagesList(records) : records;
    const sanitizedRecords = targetRecords.map((rec) => {
      if (!rec || typeof rec !== 'object') return rec;
      const copy = { ...rec };
      if ('whatsapp' in copy && copy.whatsapp) {
        copy.whatsapp = normalizePhoneWithZero(copy.whatsapp);
      }
      if ('ownerWhatsapp' in copy && copy.ownerWhatsapp) {
        copy.ownerWhatsapp = normalizePhoneWithZero(copy.ownerWhatsapp);
      }
      if (table === 'pets' && 'photoUrl' in copy) {
        copy.photoUrl = encryptPhotoUrl(copy.photoUrl);
      }
      if (table === 'queues' && 'photoUrl' in copy) {
        copy.photoUrl = encryptPhotoUrl(copy.photoUrl);
      }
      if (table === 'soapRecords' && 'diagnosticAttachments' in copy) {
        copy.diagnosticAttachments = encryptDiagnosticAttachments(copy.diagnosticAttachments);
      }
      if (table === 'cages') {
        copy.id = normalizeCageId(copy.id, copy.label) || copy.id;
      }
      return copy;
    });

    const payload = JSON.stringify({
      action: 'syncAll',
      timestamp: new Date().toISOString(),
      data: { [table]: sanitizedRecords },
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, message: `Gagal mengirim data tabel "${table}" (HTTP ${res.status}).` };
    }

    const result = await res.json().catch(() => ({ status: 'success' }));
    return {
      success: true,
      message: result.message || `Tabel "${table}" berhasil disinkronkan.`,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, message: `Timeout saat sinkron tabel "${table}" (25 detik).` };
    }
    return {
      success: false,
      message: `Gagal mengirim tabel "${table}": ${err.message || 'Koneksi error'}`,
    };
  }
}

export async function pushSingleRecordToSpreadsheet(
  webAppUrl: string,
  sheetName: 'owners' | 'pets' | 'queues' | 'soapRecords' | 'cages' | 'inventory' | 'bookings' | 'feedbacks' | 'staff',
  record: any
): Promise<boolean> {
  if (!webAppUrl || !webAppUrl.trim()) return false;

  try {
    let recordToPush = record;
    if (record && typeof record === 'object') {
      const copy = { ...record };
      if ('whatsapp' in copy && copy.whatsapp) {
        copy.whatsapp = normalizePhoneWithZero(copy.whatsapp);
      }
      if ('ownerWhatsapp' in copy && copy.ownerWhatsapp) {
        copy.ownerWhatsapp = normalizePhoneWithZero(copy.ownerWhatsapp);
      }
      if (sheetName === 'pets' && 'photoUrl' in copy) {
        copy.photoUrl = encryptPhotoUrl(copy.photoUrl);
      }
      if (sheetName === 'queues' && 'photoUrl' in copy) {
        copy.photoUrl = encryptPhotoUrl(copy.photoUrl);
      }
      if (sheetName === 'soapRecords' && 'diagnosticAttachments' in copy) {
        copy.diagnosticAttachments = encryptDiagnosticAttachments(copy.diagnosticAttachments);
      }
      if (sheetName === 'cages') {
        copy.id = normalizeCageId(copy.id, copy.label) || copy.id;
      }
      recordToPush = copy;
    }

    const payload = JSON.stringify({
      action: 'upsert',
      table: sheetName,
      record: recordToPush,
      timestamp: new Date().toISOString(),
    });

    await fetch(webAppUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: payload,
      mode: 'no-cors', // fire-and-forget for background real-time sync
    });

    return true;
  } catch (err) {
    console.warn('Gagal background sync record ke Spreadsheet', err);
    return false;
  }
}

// ==========================================
// GOOGLE APPS SCRIPT TEMPLATE CODE
// ==========================================

export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * ============================================================
 * VIER PET CARE - GOOGLE SPREADSHEET DATABASE BACKEND
 * ============================================================
 * Skrip ini mengubah Google Sheets Anda menjadi Database Real-time
 * untuk aplikasi Sistem Manajemen Klinik Hewan Terpadu Vier Pet Care.
 * 
 * CARA MEMASANG:
 * 1. Di Google Sheets, buka menu: Ekstensi (Extensions) > Apps Script
 * 2. Hapus semua kode default dan tempelkan seluruh kode ini.
 * 3. Klik Simpan (ikon disket / Ctrl+S).
 * 4. Klik tombol "Deploy" (Terapkan) > "New deployment" (Deployment baru).
 * 5. Pilih tipe: "Web app" (Aplikasi Web).
 * 6. Setelan:
 *    - Description: Vier Pet Care DB
 *    - Execute as: Me (email Anda)
 *    - Who has access: Anyone (Siapa saja)  <-- PENTING!
 * 7. Klik "Deploy", beri izin otorisasi Google jika diminta.
 * 8. Salin "Web app URL" (akhiran .../exec) lalu tempelkan di aplikasi Vier Pet Care!
 */

const SHEET_NAMES = {
  owners: '1_Pemilik',
  pets: '2_Pasien',
  queues: '3_Antrean',
  soapRecords: '4_RekamMedis',
  cages: '5_RawatInap',
  inventory: '6_StokObat',
  bookings: '7_Booking',
  staff: '8_Staf',
  feedbacks: '9_KepuasanSaran'
};

const TABLE_HEADERS = {
  owners: ['id', 'name', 'whatsapp', 'address', 'registeredAt', 'notes'],
  pets: ['id', 'ownerId', 'ownerName', 'ownerWhatsapp', 'name', 'type', 'breed', 'ageOrDob', 'sex', 'weight', 'photoUrl', 'status', 'registeredAt', 'notes', 'informedConsent'],
  queues: ['id', 'ticketNumber', 'ownerWhatsapp', 'ownerName', 'petName', 'petType', 'serviceType', 'chiefComplaint', 'status', 'createdAt', 'assignedDoctor', 'informedConsent'],
  soapRecords: ['id', 'queueId', 'petId', 'petName', 'ownerName', 'ownerWhatsapp', 'veterinarian', 'date', 'vitals', 'soap', 'prescriptions', 'diagnosticAttachments', 'diagnosticNotes', 'serviceFee', 'notes'],
  cages: ['id', 'label', 'status', 'petId', 'petName', 'petType', 'ownerName', 'ownerWhatsapp', 'diagnosis', 'admittedAt', 'veterinarian', 'observations'],
  inventory: ['id', 'name', 'category', 'batchNo', 'expireDate', 'minThreshold', 'stockQuantity', 'unit', 'price', 'lastRestocked'],
  bookings: ['id', 'petName', 'petType', 'ownerName', 'ownerWhatsapp', 'serviceType', 'date', 'time', 'doctor', 'notes', 'status'],
  staff: ['id', 'username', 'name', 'role', 'password', 'avatar'],
  feedbacks: ['id', 'ticketNumber', 'ownerName', 'ownerWhatsapp', 'petName', 'serviceType', 'satisfactionRating', 'satisfactionLabel', 'category', 'feedbackText', 'submittedAt']
};

// ==========================================
// STAGE 6 - GOOGLE SHEETS ACCESS OPTIMIZATION
// ==========================================
const CACHE_TTL_SECONDS = 120;
const QUERY_CACHE_TTL_SECONDS = 60;
const COUNTS_CACHE_KEY = 'mypet_counts_v1';
const COUNTS_CACHE_TS_KEY = 'mypet_counts_ts_v1';
const QUERY_CACHE_VERSION_KEY = 'mypet_query_cache_version_v1';
const QUERY_CACHE_MAX_BYTES = 90000;

function getQueryCacheVersion() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty(QUERY_CACHE_VERSION_KEY) || '1';
}

function invalidateQueryCache() {
  const props = PropertiesService.getScriptProperties();
  const current = Number(props.getProperty(QUERY_CACHE_VERSION_KEY) || '1');
  props.setProperty(QUERY_CACHE_VERSION_KEY, String(current + 1));
}

function countTableRowsFast(ss, table) {
  const sheet = ss.getSheetByName(SHEET_NAMES[table]);
  if (!sheet || sheet.getLastRow() < 2) return 0;

  // IDs are stored in column A. Count non-empty IDs without materializing
  // the complete table into objects.
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] !== '' && values[i][0] !== null && values[i][0] !== undefined) count++;
  }
  return count;
}

function calculateCounts(ss) {
  const counts = {};
  Object.keys(SHEET_NAMES).forEach(table => {
    counts[table] = countTableRowsFast(ss, table);
  });
  return counts;
}

function getCachedCounts(ss) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(COUNTS_CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  const props = PropertiesService.getScriptProperties();
  const persisted = props.getProperty(COUNTS_CACHE_KEY);
  const persistedTs = Number(props.getProperty(COUNTS_CACHE_TS_KEY) || '0');
  if (persisted && persistedTs && (Date.now() - persistedTs) < CACHE_TTL_SECONDS * 1000) {
    try {
      const parsed = JSON.parse(persisted);
      cache.put(COUNTS_CACHE_KEY, persisted, CACHE_TTL_SECONDS);
      return parsed;
    } catch (e) {}
  }

  const counts = calculateCounts(ss);
  const serialized = JSON.stringify(counts);
  cache.put(COUNTS_CACHE_KEY, serialized, CACHE_TTL_SECONDS);
  props.setProperty(COUNTS_CACHE_KEY, serialized);
  props.setProperty(COUNTS_CACHE_TS_KEY, String(Date.now()));
  return counts;
}

function refreshCountsCache(ss) {
  const counts = calculateCounts(ss);
  const serialized = JSON.stringify(counts);
  CacheService.getScriptCache().put(COUNTS_CACHE_KEY, serialized, CACHE_TTL_SECONDS);
  PropertiesService.getScriptProperties().setProperty(COUNTS_CACHE_KEY, serialized);
  return counts;
}

function invalidateCountsCache() {
  CacheService.getScriptCache().remove(COUNTS_CACHE_KEY);
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(COUNTS_CACHE_KEY);
  props.deleteProperty(COUNTS_CACHE_TS_KEY);
}

function makeQueryCacheKey(table, offset, limit, filters) {
  const raw = [
    getQueryCacheVersion(),
    table,
    String(offset || 0),
    String(limit || ''),
    String(filters && filters.search || '').trim().toLowerCase(),
    String(filters && filters.species || '').trim().toLowerCase(),
    String(filters && filters.status || '').trim().toLowerCase()
  ].join('|');

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    raw,
    Utilities.Charset.UTF_8
  );

  return 'q_' + digest.map(function(b) {
    const n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}

function queryTableDataCached(ss, table, offset, limit, filters) {
  const cache = CacheService.getScriptCache();
  const key = makeQueryCacheKey(table, offset, limit, filters);
  const cached = cache.get(key);

  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  const result = queryTableDataUncached(ss, table, offset, limit, filters);
  try {
    const serialized = JSON.stringify(result);
    // CacheService has a per-value size limit; stay below it.
    if (serialized.length <= QUERY_CACHE_MAX_BYTES) {
      cache.put(key, serialized, QUERY_CACHE_TTL_SECONDS);
    }
  } catch (e) {}

  return result;
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheetsExist(ss);

  const action = e && e.parameter && e.parameter.action ? e.parameter.action : 'ping';

  if (action === 'ping') {
    // Stage 6: gunakan cache untuk menghindari scan 9 kolom ID pada setiap ping.
    const counts = getCachedCounts(ss);

    return createJsonResponse({
      status: 'success',
      message: 'Vier Pet Care Google Sheets Database Online & Terhubung',
      tables: Object.values(SHEET_NAMES),
      counts: counts,
      timestamp: new Date().toISOString()
    });
  }

  if (action === 'fetchAll') {
    const fullData = {};
    Object.keys(SHEET_NAMES).forEach(table => {
      fullData[table] = readTableData(ss, table);
    });

    return createJsonResponse({
      status: 'success',
      data: fullData,
      timestamp: new Date().toISOString()
    });
  }

  if (action === 'fetchTable' && e && e.parameter && e.parameter.table) {
    const table = e.parameter.table;
    const offset = e.parameter.offset ? parseInt(e.parameter.offset, 10) : 0;
    const limit = e.parameter.limit ? parseInt(e.parameter.limit, 10) : undefined;
    const filters = {
      search: e.parameter.search || '',
      species: e.parameter.species || '',
      status: e.parameter.status || ''
    };
    const result = queryTableDataCached(ss, table, offset, limit, filters);

    return createJsonResponse({
      status: 'success',
      table: table,
      data: result.data,
      count: result.data.length,
      total: result.total,
      offset: offset,
      limit: limit || result.total,
      totalPages: limit ? Math.max(1, Math.ceil(result.total / limit)) : 1,
      timestamp: new Date().toISOString()
    });
  }

  return createJsonResponse({ status: 'error', message: 'Action tidak dikenal' });
}

function doPost(e) {
  // Kunci eksekusi supaya tidak ada 2 request tulis yang tabrakan di sheet yang sama
  // (mis. 2 staf menyimpan data hampir bersamaan). Tunggu maksimal 15 detik untuk giliran.
  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(15000);

  if (!gotLock) {
    return createJsonResponse({
      status: 'error',
      message: 'Server sedang memproses permintaan lain, silakan coba lagi beberapa detik.'
    });
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheetsExist(ss);

    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }

    const action = payload.action || 'syncAll';

    if (action === 'syncAll' && payload.data) {
      const db = payload.data;
      Object.keys(SHEET_NAMES).forEach(table => {
        if (db[table] !== undefined) {
          writeTableData(ss, table, db[table]);
        }
      });

      // Data berubah: naikkan versi query cache dan refresh count cache sekali.
      invalidateQueryCache();
      invalidateCountsCache();
      refreshCountsCache(ss);

      return createJsonResponse({
        status: 'success',
        message: 'Data berhasil disinkronkan ke Google Spreadsheet.',
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'upsert' && payload.table && payload.record) {
      upsertRecord(ss, payload.table, payload.record);
      invalidateQueryCache();
      invalidateCountsCache();
      refreshCountsCache(ss);
      return createJsonResponse({
        status: 'success',
        message: 'Record berhasil diperbarui di sheet: ' + payload.table,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'delete' && payload.table && payload.id) {
      const deleted = deleteRecord(ss, payload.table, payload.id);
      if (deleted) {
        invalidateQueryCache();
        invalidateCountsCache();
        refreshCountsCache(ss);
      }
      return createJsonResponse({
        status: deleted ? 'success' : 'error',
        message: deleted ? 'Record berhasil dihapus dari sheet: ' + payload.table : 'Record tidak ditemukan.'
      });
    }

    return createJsonResponse({ status: 'error', message: 'Action atau payload tidak valid' });
  } catch (err) {
    return createJsonResponse({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function ensureSheetsExist(ss) {
  Object.keys(SHEET_NAMES).forEach(table => {
    const name = SHEET_NAMES[table];
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    
    // Check if headers exist
    if (sheet.getLastRow() === 0) {
      const headers = TABLE_HEADERS[table];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#701a75').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
  });
}

function readTableData(ss, table, offset, limit) {
  const sheetName = SHEET_NAMES[table];
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const totalDataRows = sheet.getLastRow() - 1;
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1 || totalDataRows < 1) return [];

  const startRow = 2 + (offset ? Math.max(0, offset) : 0);
  if (startRow > sheet.getLastRow()) return [];

  const numRows = limit ? Math.min(limit, sheet.getLastRow() - startRow + 1) : sheet.getLastRow() - startRow + 1;
  if (numRows <= 0) return [];

  const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const dataRange = sheet.getRange(startRow, 1, numRows, lastCol);
  const dataRows = dataRange.getValues();

  // Cari kolom 'id' (case-insensitive) supaya baris yang diinput manual
  // di Google Sheets tanpa kolom id bisa diberi ID permanen.
  const idColIdx = headerRow.findIndex(h => String(h).trim().toLowerCase() === 'id');
  const prefix = String(table).slice(0, 3).toLowerCase();

  const results = dataRows.map((row, rowIdx) => {
    let idVal = idColIdx !== -1 ? row[idColIdx] : '';
    if (idColIdx !== -1 && table !== 'cages') {
      const rowHasOtherData = row.some((v, idx) => idx !== idColIdx && v !== '' && v !== null && v !== undefined);
      if (rowHasOtherData && (idVal === '' || idVal === null || idVal === undefined)) {
        idVal = prefix + '-' + (offset ? offset + rowIdx : rowIdx) + '-' + Math.abs(String(row[0] || '').charCodeAt(0) || 1);
      }
    }

    const item = {};
    headerRow.forEach((headerName, idx) => {
      if (!headerName) return;
      let val = idx === idColIdx && idVal ? idVal : row[idx];
      
      // Jika tipe data adalah Date di Google Sheets, konversi ke string berformat lokal spreadsheet-nya
      if (val && (val instanceof Date || Object.prototype.toString.call(val) === '[object Date]')) {
        try {
          val = Utilities.formatDate(val, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");
        } catch(e) {
          try { val = val.toISOString(); } catch(err) {}
        }
      }
      
      if (typeof val === 'string' && ((val.startsWith('{') && val.endsWith('}')) || (val.startsWith('[') && val.endsWith(']')))) {
        try { val = JSON.parse(val); } catch(e) {}
      }
      item[String(headerName).trim()] = val;
    });
    return item;
  }).filter(item => {
    return Object.values(item).some(val => val !== '' && val !== null && val !== undefined);
  });

  return results;
}

function queryTableDataUncached(ss, table, offset, limit, filters) {
  const sheetName = SHEET_NAMES[table];
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return { data: [], total: 0 };

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(h => String(h || '').trim());

  // Penting untuk data besar: filter pada raw rows terlebih dahulu.
  // Jangan membuat object + JSON.parse untuk ratusan ribu baris yang akhirnya tidak dikembalikan.
  const rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const search = String(filters && filters.search || '').trim().toLowerCase();
  const species = String(filters && filters.species || '').trim().toLowerCase();
  const status = String(filters && filters.status || '').trim().toLowerCase();

  const idx = {};
  headers.forEach((h, i) => { if (h) idx[h.toLowerCase()] = i; });

  const clean = (value) => {
    if (value instanceof Date) {
      try { return Utilities.formatDate(value, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss"); }
      catch(e) { return String(value); }
    }
    return value;
  };

  const rowHasData = (row) => row.some(v => v !== '' && v !== null && v !== undefined);

  const matchedRows = [];
  let total = 0;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!rowHasData(row)) continue;

    // Filter selektif dilakukan sebelum pencarian teks.
    if (table === 'pets') {
      if (species) {
        const typeValue = String(row[idx.type] ?? '').toLowerCase();
        if (typeValue !== species) continue;
      }
      if (status) {
        const statusValue = String(row[idx.status] ?? '').toLowerCase();
        if (statusValue !== status) continue;
      }
    } else if (status) {
      const statusValue = String(row[idx.status] ?? '').toLowerCase();
      if (statusValue !== status) continue;
    }

    if (search) {
      let searchable = '';
      if (table === 'pets') {
        searchable = [
          row[idx.name], row[idx.id], row[idx.breed],
          row[idx.ownername], row[idx.owneraddress],
          row[idx.ownerwhatsapp]
        ].map(v => String(v ?? '').toLowerCase()).join(' ');

        const digits = search.replace(/\\D/g, '');
        const phone = String(row[idx.ownerwhatsapp] ?? '').replace(/\\D/g, '');
        if (!searchable.includes(search) && (!digits || !phone.includes(digits))) continue;
      } else {
        // Pertahankan perilaku pencarian lama, tetapi tanpa object allocation.
        searchable = row.map(v => String(v ?? '').toLowerCase()).join(' ');
        if (!searchable.includes(search)) continue;
      }
    }

    total++;

    // Hanya materialisasi object untuk baris yang benar-benar masuk halaman.
    const start = Math.max(0, Number(offset) || 0);
    const pageLimit = Number(limit) > 0 ? Number(limit) : null;
    if (total > start && (!pageLimit || matchedRows.length < pageLimit)) {
      const item = {};
      headers.forEach((header, col) => {
        if (!header) return;
        item[header] = clean(row[col]);
      });
      matchedRows.push(item);
    }
  }

  return { data: matchedRows, total: total };
}mport {
  Owner,
  Pet,
  VisitQueue,
  SoapRecord,
  InpatientCage,
  InventoryItem,
  BookingAppointment,
  StaffUser,
  CustomerFeedback,
  SpreadsheetConfig
} from '../types';
import { normalizePhoneWithZero } from '../utils/phoneUtils';
import {
  encryptPhotoUrl,
  decryptPhotoUrl,
  encryptDiagnosticAttachments,
  decryptDiagnosticAttachments
} from '../utils/cryptoUtils';
import { normalizeCageId, sanitizeCagesList } from '../utils/cageUtils';

export interface SpreadsheetDatabaseSchema {
  owners: Owner[];
  pets: Pet[];
  queues: VisitQueue[];
  soapRecords: SoapRecord[];
  cages: InpatientCage[];
  inventory: InventoryItem[];
  bookings: BookingAppointment[];
  staff: StaffUser[];
  feedbacks: CustomerFeedback[];
}

export const FINAL_SPREADSHEET_URL =
  'https://script.google.com/macros/s/AKfycbyx7QzGHB3gfH-YOXOSWKnAWX3wu_xAoKU6Hiog_vEJUaUg6D14pFiz8j9LgoWVP-A72g/exec';

export const DEFAULT_SPREADSHEET_CONFIG: SpreadsheetConfig = {
  webAppUrl: FINAL_SPREADSHEET_URL,
  spreadsheetName: 'Vier Pet Care - Database Klinik',
  autoSync: true,
  isConnected: true,
};

// ==========================================
// CSV UTILITIES (EXPORT & IMPORT)
// ==========================================

export function objectsToCSV<T extends Record<string, any>>(data: T[]): string {
  if (!data || data.length === 0) return '';
  const keys = Object.keys(data[0]);
  const header = keys.join(',');
  const rows = data.map((item) =>
    keys
      .map((key) => {
        let val = item[key];
        if (val === null || val === undefined) val = '';
        if (typeof val === 'object') {
          val = JSON.stringify(val);
        }
        val = String(val).replace(/"/g, '""');
        if (val.includes(',') || val.includes('\n') || val.includes('"')) {
          val = `"${val}"`;
        }
        return val;
      })
      .join(',')
  );
  return [header, ...rows].join('\n');
}

export function csvToObjects<T = Record<string, any>>(csvString: string): T[] {
  if (!csvString || !csvString.trim()) return [];
  const lines = csvString.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse header line
  const headers = parseCSVLine(lines[0]);
  const results: T[] = [];

  for (let i = 1; i < lines.length; i++) {
    const currentLine = lines[i].trim();
    if (!currentLine) continue;
    const values = parseCSVLine(currentLine);
    const obj: Record<string, any> = {};

    headers.forEach((header, index) => {
      let val: any = values[index] ?? '';
      // Try to parse JSON objects or arrays
      if (typeof val === 'string' && ((val.startsWith('{') && val.endsWith('}')) || (val.startsWith('[') && val.endsWith(']')))) {
        try {
          val = JSON.parse(val);
        } catch {
          // Keep as string
        }
      }
      obj[header] = val;
    });

    results.push(obj as T);
  }

  return results;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function downloadCSV(csvContent: string, fileName: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportDatabaseAsSpreadsheets(db: SpreadsheetDatabaseSchema) {
  downloadCSV(objectsToCSV(db.owners), 'VierPetCare_Sheet_1_Pemilik.csv');
  setTimeout(() => downloadCSV(objectsToCSV(db.pets), 'VierPetCare_Sheet_2_Pasien.csv'), 200);
  setTimeout(() => downloadCSV(objectsToCSV(db.queues), 'VierPetCare_Sheet_3_Antrean.csv'), 400);
  setTimeout(() => downloadCSV(objectsToCSV(db.soapRecords), 'VierPetCare_Sheet_4_RekamMedis.csv'), 600);
  setTimeout(() => downloadCSV(objectsToCSV(db.cages), 'VierPetCare_Sheet_5_RawatInap.csv'), 800);
  setTimeout(() => downloadCSV(objectsToCSV(db.inventory), 'VierPetCare_Sheet_6_StokObat.csv'), 1000);
  setTimeout(() => downloadCSV(objectsToCSV(db.bookings), 'VierPetCare_Sheet_7_Booking.csv'), 1200);
  setTimeout(() => downloadCSV(objectsToCSV(db.staff), 'VierPetCare_Sheet_8_Staf.csv'), 1400);
  setTimeout(() => downloadCSV(objectsToCSV(db.feedbacks || []), 'VierPetCare_Sheet_9_KepuasanSaran.csv'), 1600);
}

// ==========================================
// GOOGLE SHEETS / APPS SCRIPT WEB APP INTEGRATION
// ==========================================

export async function testSpreadsheetConnection(webAppUrl: string): Promise<{
  success: boolean;
  message: string;
  tables?: string[];
  counts?: Record<string, number>;
}> {
  if (!webAppUrl || !webAppUrl.trim()) {
    return { success: false, message: 'URL Google Apps Script Web App belum diisi.' };
  }

  const cleanUrl = webAppUrl.trim();
  const testUrl = cleanUrl.includes('?')
    ? `${cleanUrl}&action=ping&_t=${Date.now()}`
    : `${cleanUrl}?action=ping&_t=${Date.now()}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(testUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        success: false,
        message: `HTTP Error: ${res.status} (${res.statusText}). Pastikan deployment disetel ke "Anyone".`,
      };
    }

    const data = await res.json();
    if (data.status === 'success' || data.connected || data.tables) {
      return {
        success: true,
        message: 'Koneksi ke Google Spreadsheet berhasil terhubung!',
        tables: data.tables || ['Pemilik', 'Pasien', 'Antrean', 'RekamMedis', 'RawatInap', 'StokObat', 'Booking', 'Staf', 'KepuasanSaran'],
        counts: data.counts,
      };
    }

    return {
      success: true,
      message: 'Koneksi terhubung (respon diterima).',
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, message: 'Koneksi timeout (lebih dari 12 detik). Periksa URL Web App Anda.' };
    }
    return {
      success: false,
      message: `Gagal menghubungi Spreadsheet: ${err.message || 'Periksa URL Web App dan izin akses (Anyone).'}`
    };
  }
}

export function decryptDatabaseFromSpreadsheet(db: Partial<SpreadsheetDatabaseSchema>): SpreadsheetDatabaseSchema {
  return {
    ...db,
    pets: db.pets?.map((p) => ({
      ...p,
      photoUrl: decryptPhotoUrl(p.photoUrl),
    })),
    queues: db.queues?.map((q) => ({
      ...q,
      photoUrl: decryptPhotoUrl(q.photoUrl),
    })),
    soapRecords: db.soapRecords?.map((s) => ({
      ...s,
      diagnosticAttachments: decryptDiagnosticAttachments(s.diagnosticAttachments),
    })),
  } as SpreadsheetDatabaseSchema;
}

export async function pullFullDatabaseFromSpreadsheet(webAppUrl: string): Promise<{
  success: boolean;
  message: string;
  data?: SpreadsheetDatabaseSchema;
}> {
  if (!webAppUrl || !webAppUrl.trim()) {
    return { success: false, message: 'URL Google Apps Script belum dikonfigurasi.' };
  }

  const cleanUrl = webAppUrl.trim();
  const fetchUrl = cleanUrl.includes('?')
    ? `${cleanUrl}&action=fetchAll&_t=${Date.now()}`
    : `${cleanUrl}?action=fetchAll&_t=${Date.now()}`;

  const attemptFetch = async (): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout to allow large 100k+ row transfers
    try {
      return await fetch(fetchUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    let res: Response;
    try {
      res = await attemptFetch();
    } catch (err: any) {
      // Retry once — Apps Script "cold start" bisa melebihi timeout pertama
      if (err.name === 'AbortError') {
        res = await attemptFetch();
      } else {
        throw err;
      }
    }

    if (!res.ok) {
      return { success: false, message: `Gagal mengambil data (HTTP ${res.status}).` };
    }

    const json = await res.json();
    if (json && json.status === 'success' && json.data) {
      const decryptedData = decryptDatabaseFromSpreadsheet(json.data);
      return {
        success: true,
        message: 'Data seluruh sheet berhasil ditarik dari Google Spreadsheet.',
        data: decryptedData,
      };
    } else if (json && json.owners !== undefined) {
      const decryptedData = decryptDatabaseFromSpreadsheet(json);
      return {
        success: true,
        message: 'Data berhasil ditarik dari Spreadsheet.',
        data: decryptedData,
      };
    }

    return {
      success: false,
      message: json.message || 'Format data dari Google Apps Script tidak sesuai.',
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, message: 'Koneksi timeout setelah 2x percobaan (120 detik). Apps Script memerlukan waktu lebih lama karena volume data yang sangat besar.' };
    }
    return {
      success: false,
      message: `Error penarikan data: ${err.message || 'Koneksi terputus'}`,
    };
  }
}

/**
 * Tarik data spesifik satu tabel dengan paging / chunking opsional
 * Menghindari beban berlebih saat data per sheet mencapai puluhan ribu baris.
 */
export async function queryTableFromSpreadsheet(
  webAppUrl: string,
  table: keyof SpreadsheetDatabaseSchema,
  options: { page?: number; limit?: number; search?: string; species?: string; status?: string } = {}
): Promise<{ success: boolean; message: string; data?: any[]; total?: number; page?: number; limit?: number; totalPages?: number }> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 10));

  // Prefer the Node backend when the app is running with its API server.
  // GitHub Pages has no /api endpoint, so it transparently falls back to Apps Script.
  try {
    const params = new URLSearchParams({
      table: String(table),
      page: String(page),
      limit: String(limit),
    });
    if (options.search) params.set('search', options.search);
    if (options.species) params.set('species', options.species);
    if (options.status) params.set('status', options.status);

    const apiRes = await fetch(`/api/sync/query?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (apiRes.ok) {
      const json = await apiRes.json();
      if (json.success && Array.isArray(json.data)) return json;
    }
  } catch {
    // Static hosting / unavailable backend: use Apps Script below.
  }

  return pullTableFromSpreadsheet(webAppUrl, table, (page - 1) * limit, limit, {
    search: options.search || '',
    species: options.species || '',
    status: options.status || ''
  });
}

export async function pullTableFromSpreadsheet(
  webAppUrl: string,
  table: keyof SpreadsheetDatabaseSchema,
  offset: number = 0,
  limit?: number,
  filters: { search?: string; species?: string; status?: string } = {}
): Promise<{ success: boolean; message: string; data?: any[]; total?: number; page?: number; limit?: number; totalPages?: number }> {
  if (!webAppUrl || !webAppUrl.trim()) {
    return { success: false, message: 'URL Google Apps Script belum dikonfigurasi.' };
  }

  const cleanUrl = webAppUrl.trim();
  let fetchUrl = cleanUrl.includes('?')
    ? `${cleanUrl}&action=fetchTable&table=${table}&offset=${offset}&_t=${Date.now()}`
    : `${cleanUrl}?action=fetchTable&table=${table}&offset=${offset}&_t=${Date.now()}`;

  if (limit) {
    fetchUrl += `&limit=${limit}`;
  }
  if (filters.search) fetchUrl += `&search=${encodeURIComponent(filters.search)}`;
  if (filters.species) fetchUrl += `&species=${encodeURIComponent(filters.species)}`;
  if (filters.status) fetchUrl += `&status=${encodeURIComponent(filters.status)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const res = await fetch(fetchUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, message: `Gagal menarik tabel ${table} (HTTP ${res.status})` };
    }

    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      let records = json.data;
      if (table === 'pets') {
        records = records.map((p: any) => ({ ...p, photoUrl: decryptPhotoUrl(p.photoUrl) }));
      } else if (table === 'queues') {
        records = records.map((q: any) => ({ ...q, photoUrl: decryptPhotoUrl(q.photoUrl) }));
      } else if (table === 'soapRecords') {
        records = records.map((s: any) => ({ ...s, diagnosticAttachments: decryptDiagnosticAttachments(s.diagnosticAttachments) }));
      }
      return {
        success: true,
        message: `Tabel ${table} berhasil ditarik`,
        data: records,
        total: Number(json.total ?? json.count ?? records.length),
        page: Number(json.page ?? Math.floor(offset / (limit || records.length || 1)) + 1),
        limit: Number(json.limit ?? limit ?? records.length),
        totalPages: Number(json.totalPages ?? 0) || Math.max(1, Math.ceil(Number(json.total ?? json.count ?? records.length) / Number(json.limit ?? limit ?? records.length || 1))),
      };
    }

    return { success: false, message: json.message || 'Format tidak sesuai' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal koneksi tabel' };
  }
}

export async function pushFullDatabaseToSpreadsheet(
  webAppUrl: string,
  db: SpreadsheetDatabaseSchema
): Promise<{
  success: boolean;
  message: string;
}> {
  if (!webAppUrl || !webAppUrl.trim()) {
    return { success: false, message: 'URL Google Apps Script belum dikonfigurasi.' };
  }

  const cleanUrl = webAppUrl.trim();

  try {
    // Ensure phone numbers start with '0' and photos/diagnostic attachments are stored encrypted
    const sanitizedDb = {
      ...db,
      owners: db.owners?.map((o) => ({ ...o, whatsapp: normalizePhoneWithZero(o.whatsapp) })),
      pets: db.pets?.map((p) => ({
        ...p,
        ownerWhatsapp: normalizePhoneWithZero(p.ownerWhatsapp),
        photoUrl: encryptPhotoUrl(p.photoUrl),
      })),
      queues: db.queues?.map((q) => ({
        ...q,
        ownerWhatsapp: normalizePhoneWithZero(q.ownerWhatsapp),
        photoUrl: encryptPhotoUrl(q.photoUrl),
      })),
      soapRecords: db.soapRecords?.map((s) => ({
        ...s,
        diagnosticAttachments: encryptDiagnosticAttachments(s.diagnosticAttachments) as any,
      })),
      feedbacks: db.feedbacks?.map((f) => ({
        ...f,
        ownerWhatsapp: f.ownerWhatsapp ? normalizePhoneWithZero(f.ownerWhatsapp) : f.ownerWhatsapp,
      })),
      cages: sanitizeCagesList(db.cages || []).map((c) => ({
        ...c,
        id: normalizeCageId(c.id, c.label) || c.id,
        ownerWhatsapp: c.ownerWhatsapp ? normalizePhoneWithZero(c.ownerWhatsapp) : c.ownerWhatsapp,
      })),
    };

    // We send payload as text/plain to avoid browser CORS preflight blocks with Google Apps Script
    const payload = JSON.stringify({
      action: 'syncAll',
      timestamp: new Date().toISOString(),
      data: sanitizedDb,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 40000);

    const res = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, message: `Gagal mengirim data (HTTP ${res.status}).` };
    }

    const result = await res.json().catch(() => ({ status: 'success' }));
    return {
      success: true,
      message: result.message || 'Semua sheet di Google Spreadsheet berhasil diperbarui!',
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, message: 'Koneksi timeout (lebih dari 40 detik). Data mungkin terlalu besar untuk sinkron penuh — coba lagi atau kurangi data lama.' };
    }
    return {
      success: false,
      message: `Gagal mengirim data ke Spreadsheet: ${err.message || 'Koneksi error'}`,
    };
  }
}

/**
 * Push HANYA satu tabel/sheet (bukan seluruh database). Dipakai oleh auto-sync
 * per-tabel supaya 1 perubahan kecil tidak memicu tulis-ulang semua 9 sheet.
 * Memakai action yang sama ('syncAll') tapi payload 'data' hanya berisi 1 key,
 * sehingga di sisi Apps Script hanya sheet tabel ini yang di-clear & ditulis ulang.
 */
export async function pushTableToSpreadsheet(
  webAppUrl: string,
  table: keyof SpreadsheetDatabaseSchema,
  records: any[]
): Promise<{ success: boolean; message: string }> {
  if (!webAppUrl || !webAppUrl.trim()) {
    return { success: false, message: 'URL Google Apps Script belum dikonfigurasi.' };
  }

  const cleanUrl = webAppUrl.trim();

  try {
    const targetRecords = table === 'cages' ? sanitizeCagesList(records) : records;
    const sanitizedRecords = targetRecords.map((rec) => {
      if (!rec || typeof rec !== 'object') return rec;
      const copy = { ...rec };
      if ('whatsapp' in copy && copy.whatsapp) {
        copy.whatsapp = normalizePhoneWithZero(copy.whatsapp);
      }
      if ('ownerWhatsapp' in copy && copy.ownerWhatsapp) {
        copy.ownerWhatsapp = normalizePhoneWithZero(copy.ownerWhatsapp);
      }
      if (table === 'pets' && 'photoUrl' in copy) {
        copy.photoUrl = encryptPhotoUrl(copy.photoUrl);
      }
      if (table === 'queues' && 'photoUrl' in copy) {
        copy.photoUrl = encryptPhotoUrl(copy.photoUrl);
      }
      if (table === 'soapRecords' && 'diagnosticAttachments' in copy) {
        copy.diagnosticAttachments = encryptDiagnosticAttachments(copy.diagnosticAttachments);
      }
      if (table === 'cages') {
        copy.id = normalizeCageId(copy.id, copy.label) || copy.id;
      }
      return copy;
    });

    const payload = JSON.stringify({
      action: 'syncAll',
      timestamp: new Date().toISOString(),
      data: { [table]: sanitizedRecords },
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, message: `Gagal mengirim data tabel "${table}" (HTTP ${res.status}).` };
    }

    const result = await res.json().catch(() => ({ status: 'success' }));
    return {
      success: true,
      message: result.message || `Tabel "${table}" berhasil disinkronkan.`,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, message: `Timeout saat sinkron tabel "${table}" (25 detik).` };
    }
    return {
      success: false,
      message: `Gagal mengirim tabel "${table}": ${err.message || 'Koneksi error'}`,
    };
  }
}

export async function pushSingleRecordToSpreadsheet(
  webAppUrl: string,
  sheetName: 'owners' | 'pets' | 'queues' | 'soapRecords' | 'cages' | 'inventory' | 'bookings' | 'feedbacks' | 'staff',
  record: any
): Promise<boolean> {
  if (!webAppUrl || !webAppUrl.trim()) return false;

  try {
    let recordToPush = record;
    if (record && typeof record === 'object') {
      const copy = { ...record };
      if ('whatsapp' in copy && copy.whatsapp) {
        copy.whatsapp = normalizePhoneWithZero(copy.whatsapp);
      }
      if ('ownerWhatsapp' in copy && copy.ownerWhatsapp) {
        copy.ownerWhatsapp = normalizePhoneWithZero(copy.ownerWhatsapp);
      }
      if (sheetName === 'pets' && 'photoUrl' in copy) {
        copy.photoUrl = encryptPhotoUrl(copy.photoUrl);
      }
      if (sheetName === 'queues' && 'photoUrl' in copy) {
        copy.photoUrl = encryptPhotoUrl(copy.photoUrl);
      }
      if (sheetName === 'soapRecords' && 'diagnosticAttachments' in copy) {
        copy.diagnosticAttachments = encryptDiagnosticAttachments(copy.diagnosticAttachments);
      }
      if (sheetName === 'cages') {
        copy.id = normalizeCageId(copy.id, copy.label) || copy.id;
      }
      recordToPush = copy;
    }

    const payload = JSON.stringify({
      action: 'upsert',
      table: sheetName,
      record: recordToPush,
      timestamp: new Date().toISOString(),
    });

    await fetch(webAppUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: payload,
      mode: 'no-cors', // fire-and-forget for background real-time sync
    });

    return true;
  } catch (err) {
    console.warn('Gagal background sync record ke Spreadsheet', err);
    return false;
  }
}

// ==========================================
// GOOGLE APPS SCRIPT TEMPLATE CODE
// ==========================================

export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * ============================================================
 * VIER PET CARE - GOOGLE SPREADSHEET DATABASE BACKEND
 * ============================================================
 * Skrip ini mengubah Google Sheets Anda menjadi Database Real-time
 * untuk aplikasi Sistem Manajemen Klinik Hewan Terpadu Vier Pet Care.
 * 
 * CARA MEMASANG:
 * 1. Di Google Sheets, buka menu: Ekstensi (Extensions) > Apps Script
 * 2. Hapus semua kode default dan tempelkan seluruh kode ini.
 * 3. Klik Simpan (ikon disket / Ctrl+S).
 * 4. Klik tombol "Deploy" (Terapkan) > "New deployment" (Deployment baru).
 * 5. Pilih tipe: "Web app" (Aplikasi Web).
 * 6. Setelan:
 *    - Description: Vier Pet Care DB
 *    - Execute as: Me (email Anda)
 *    - Who has access: Anyone (Siapa saja)  <-- PENTING!
 * 7. Klik "Deploy", beri izin otorisasi Google jika diminta.
 * 8. Salin "Web app URL" (akhiran .../exec) lalu tempelkan di aplikasi Vier Pet Care!
 */

const SHEET_NAMES = {
  owners: '1_Pemilik',
  pets: '2_Pasien',
  queues: '3_Antrean',
  soapRecords: '4_RekamMedis',
  cages: '5_RawatInap',
  inventory: '6_StokObat',
  bookings: '7_Booking',
  staff: '8_Staf',
  feedbacks: '9_KepuasanSaran'
};

const TABLE_HEADERS = {
  owners: ['id', 'name', 'whatsapp', 'address', 'registeredAt', 'notes'],
  pets: ['id', 'ownerId', 'ownerName', 'ownerWhatsapp', 'name', 'type', 'breed', 'ageOrDob', 'sex', 'weight', 'photoUrl', 'status', 'registeredAt', 'notes', 'informedConsent'],
  queues: ['id', 'ticketNumber', 'ownerWhatsapp', 'ownerName', 'petName', 'petType', 'serviceType', 'chiefComplaint', 'status', 'createdAt', 'assignedDoctor', 'informedConsent'],
  soapRecords: ['id', 'queueId', 'petId', 'petName', 'ownerName', 'ownerWhatsapp', 'veterinarian', 'date', 'vitals', 'soap', 'prescriptions', 'diagnosticAttachments', 'diagnosticNotes', 'serviceFee', 'notes'],
  cages: ['id', 'label', 'status', 'petId', 'petName', 'petType', 'ownerName', 'ownerWhatsapp', 'diagnosis', 'admittedAt', 'veterinarian', 'observations'],
  inventory: ['id', 'name', 'category', 'batchNo', 'expireDate', 'minThreshold', 'stockQuantity', 'unit', 'price', 'lastRestocked'],
  bookings: ['id', 'petName', 'petType', 'ownerName', 'ownerWhatsapp', 'serviceType', 'date', 'time', 'doctor', 'notes', 'status'],
  staff: ['id', 'username', 'name', 'role', 'password', 'avatar'],
  feedbacks: ['id', 'ticketNumber', 'ownerName', 'ownerWhatsapp', 'petName', 'serviceType', 'satisfactionRating', 'satisfactionLabel', 'category', 'feedbackText', 'submittedAt']
};

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheetsExist(ss);

  const action = e && e.parameter && e.parameter.action ? e.parameter.action : 'ping';

  if (action === 'ping') {
    const counts = {};
    Object.keys(SHEET_NAMES).forEach(table => {
      const sheet = ss.getSheetByName(SHEET_NAMES[table]);
      if (!sheet || sheet.getLastRow() < 2) {
        counts[table] = 0;
      } else {
        // Hitung baris yang benar-benar ada datanya (bukan baris kosong/terhapus)
        const lastRow = sheet.getLastRow();
        const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        let validRows = 0;
        for (let i = 0; i < ids.length; i++) {
          if (ids[i][0] !== '' && ids[i][0] !== null && ids[i][0] !== undefined) {
            validRows++;
          }
        }
        counts[table] = validRows;
      }
    });

    return createJsonResponse({
      status: 'success',
      message: 'Vier Pet Care Google Sheets Database Online & Terhubung',
      tables: Object.values(SHEET_NAMES),
      counts: counts,
      timestamp: new Date().toISOString()
    });
  }

  if (action === 'fetchAll') {
    const fullData = {};
    Object.keys(SHEET_NAMES).forEach(table => {
      fullData[table] = readTableData(ss, table);
    });

    return createJsonResponse({
      status: 'success',
      data: fullData,
      timestamp: new Date().toISOString()
    });
  }

  if (action === 'fetchTable' && e && e.parameter && e.parameter.table) {
    const table = e.parameter.table;
    const offset = e.parameter.offset ? parseInt(e.parameter.offset, 10) : 0;
    const limit = e.parameter.limit ? parseInt(e.parameter.limit, 10) : undefined;
    const filters = {
      search: e.parameter.search || '',
      species: e.parameter.species || '',
      status: e.parameter.status || ''
    };
    const result = queryTableData(ss, table, offset, limit, filters);

    return createJsonResponse({
      status: 'success',
      table: table,
      data: result.data,
      count: result.data.length,
      total: result.total,
      offset: offset,
      limit: limit || result.total,
      totalPages: limit ? Math.max(1, Math.ceil(result.total / limit)) : 1,
      timestamp: new Date().toISOString()
    });
  }

  return createJsonResponse({ status: 'error', message: 'Action tidak dikenal' });
}

function doPost(e) {
  // Kunci eksekusi supaya tidak ada 2 request tulis yang tabrakan di sheet yang sama
  // (mis. 2 staf menyimpan data hampir bersamaan). Tunggu maksimal 15 detik untuk giliran.
  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(15000);

  if (!gotLock) {
    return createJsonResponse({
      status: 'error',
      message: 'Server sedang memproses permintaan lain, silakan coba lagi beberapa detik.'
    });
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheetsExist(ss);

    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }

    const action = payload.action || 'syncAll';

    if (action === 'syncAll' && payload.data) {
      const db = payload.data;
      Object.keys(SHEET_NAMES).forEach(table => {
        if (db[table] !== undefined) {
          writeTableData(ss, table, db[table]);
        }
      });

      return createJsonResponse({
        status: 'success',
        message: 'Data berhasil disinkronkan ke Google Spreadsheet.',
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'upsert' && payload.table && payload.record) {
      upsertRecord(ss, payload.table, payload.record);
      return createJsonResponse({
        status: 'success',
        message: 'Record berhasil diperbarui di sheet: ' + payload.table,
        timestamp: new Date().toISOString()
      });
    }

    return createJsonResponse({ status: 'error', message: 'Action atau payload tidak valid' });
  } catch (err) {
    return createJsonResponse({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function ensureSheetsExist(ss) {
  Object.keys(SHEET_NAMES).forEach(table => {
    const name = SHEET_NAMES[table];
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    
    // Check if headers exist
    if (sheet.getLastRow() === 0) {
      const headers = TABLE_HEADERS[table];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#701a75').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
  });
}

function readTableData(ss, table, offset, limit) {
  const sheetName = SHEET_NAMES[table];
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const totalDataRows = sheet.getLastRow() - 1;
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1 || totalDataRows < 1) return [];

  const startRow = 2 + (offset ? Math.max(0, offset) : 0);
  if (startRow > sheet.getLastRow()) return [];

  const numRows = limit ? Math.min(limit, sheet.getLastRow() - startRow + 1) : sheet.getLastRow() - startRow + 1;
  if (numRows <= 0) return [];

  const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const dataRange = sheet.getRange(startRow, 1, numRows, lastCol);
  const dataRows = dataRange.getValues();

  // Cari kolom 'id' (case-insensitive) supaya baris yang diinput manual
  // di Google Sheets tanpa kolom id bisa diberi ID permanen.
  const idColIdx = headerRow.findIndex(h => String(h).trim().toLowerCase() === 'id');
  const prefix = String(table).slice(0, 3).toLowerCase();

  const results = dataRows.map((row, rowIdx) => {
    let idVal = idColIdx !== -1 ? row[idColIdx] : '';
    if (idColIdx !== -1 && table !== 'cages') {
      const rowHasOtherData = row.some((v, idx) => idx !== idColIdx && v !== '' && v !== null && v !== undefined);
      if (rowHasOtherData && (idVal === '' || idVal === null || idVal === undefined)) {
        idVal = prefix + '-' + (offset ? offset + rowIdx : rowIdx) + '-' + Math.abs(String(row[0] || '').charCodeAt(0) || 1);
      }
    }

    const item = {};
    headerRow.forEach((headerName, idx) => {
      if (!headerName) return;
      let val = idx === idColIdx && idVal ? idVal : row[idx];
      
      // Jika tipe data adalah Date di Google Sheets, konversi ke string berformat lokal spreadsheet-nya
      if (val && (val instanceof Date || Object.prototype.toString.call(val) === '[object Date]')) {
        try {
          val = Utilities.formatDate(val, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");
        } catch(e) {
          try { val = val.toISOString(); } catch(err) {}
        }
      }
      
      if (typeof val === 'string' && ((val.startsWith('{') && val.endsWith('}')) || (val.startsWith('[') && val.endsWith(']')))) {
        try { val = JSON.parse(val); } catch(e) {}
      }
      item[String(headerName).trim()] = val;
    });
    return item;
  }).filter(item => {
    return Object.values(item).some(val => val !== '' && val !== null && val !== undefined);
  });

  return results;
}

function queryTableData(ss, table, offset, limit, filters) {
  const sheetName = SHEET_NAMES[table];
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return { data: [], total: 0 };

  const lastCol = sheet.getLastColumn();
  const allRows = sheet.getRange(1, 1, sheet.getLastRow(), lastCol).getValues();
  const headers = allRows.shift().map(h => String(h || '').trim());

  const search = String(filters && filters.search || '').trim().toLowerCase();
  const species = String(filters && filters.species || '').trim().toLowerCase();
  const status = String(filters && filters.status || '').trim().toLowerCase();

  const matches = allRows.map((row, rowIdx) => {
    const item = {};
    headers.forEach((header, idx) => {
      if (!header) return;
      let val = row[idx];
      if (val instanceof Date) {
        try { val = Utilities.formatDate(val, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss"); } catch(e) {}
      }
      if (typeof val === 'string' && ((val.startsWith('{') && val.endsWith('}')) || (val.startsWith('[') && val.endsWith(']')))) {
        try { val = JSON.parse(val); } catch(e) {}
      }
      item[header] = val;
    });
    return item;
  }).filter(item => {
    if (!Object.values(item).some(val => val !== '' && val !== null && val !== undefined)) return false;

    if (table === 'pets') {
      const searchable = [
        item.name, item.id, item.breed, item.ownerName,
        item.ownerAddress, item.ownerWhatsapp
      ].map(v => String(v || '').toLowerCase()).join(' ');
      if (search) {
        const digits = search.replace(/\\D/g, '');
        const phone = String(item.ownerWhatsapp || '').replace(/\\D/g, '');
        if (!searchable.includes(search) && (!digits || !phone.includes(digits))) return false;
      }
      if (species && String(item.type || '').toLowerCase() !== species) return false;
      if (status && String(item.status || '').toLowerCase() !== status) return false;
    } else if (search) {
      const searchable = Object.values(item).map(v => String(v || '').toLowerCase()).join(' ');
      if (!searchable.includes(search)) return false;
    }
    return true;
  });

  const total = matches.length;
  const start = Math.max(0, offset || 0);
  const end = limit ? start + Math.max(0, limit) : total;
  return { data: matches.slice(start, end), total: total };
}

function writeTableData(ss, table, rows) {
  const sheetName = SHEET_NAMES[table];
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  const defaultHeaders = TABLE_HEADERS[table];
  
  // Selalu perbarui baris header ke-1 agar kolom baru otomatis terbuat jika belum ada di Spreadsheet
  sheet.getRange(1, 1, 1, defaultHeaders.length).setValues([defaultHeaders]);
  sheet.getRange(1, 1, 1, defaultHeaders.length).setFontWeight('bold').setBackground('#701a75').setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  const headers = defaultHeaders;

  // Baca data yang ada saat ini di Sheet untuk mempertahankan baris yang diinput manual di Google Sheets
  const existingSheetRows = readTableData(ss, table);
  const incomingRows = Array.isArray(rows) ? rows : [];

  // Map incoming rows berdasarkan ID untuk pencarian cepat
  const incomingMap = {};
  incomingRows.forEach(row => {
    if (!row) return;
    const id = String(row.id || '').trim();
    if (id) incomingMap[id] = row;
  });

  const mergedRows = [...incomingRows];

  // Pertahankan baris di Google Sheets yang diinput manual (belum ada di payload dari App)
  existingSheetRows.forEach(sheetRow => {
    if (!sheetRow) return;
    // Untuk tabel kandang (cages), unit fisik selalu fixed 12 kandang (A1-A6 & B1-B6), jangan merge data riwayat lama
    if (table === 'cages') return;
    let sheetId = String(sheetRow.id || '').trim();
    if (!sheetId) {
      const prefix = String(table).slice(0, 3).toLowerCase();
      sheetId = prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      sheetRow.id = sheetId;
      mergedRows.push(sheetRow);
    } else if (!incomingMap[sheetId]) {
      // Baris ini ada di Sheet tapi belum ada di incoming payload App -> Jangan dihapus!
      mergedRows.push(sheetRow);
    }
  });

  // Safeguard: Jika mergedRows kosong, jangan bersihkan sheet (mencegah data terhapus karena payload kosong tidak sengaja)
  if (mergedRows.length === 0) return;

  if (sheet.getLastRow() > 1) {
    // Bersihkan data lama
    sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), sheet.getLastColumn()).clearContent();
  }

  const matrix = mergedRows.map(item => {
    return headers.map(h => {
      let val = item[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return val;
    });
  });

  sheet.getRange(2, 1, matrix.length, headers.length).setValues(matrix);
}

function upsertRecord(ss, table, record) {
  if (!record || !record.id) return;
  const sheet = ss.getSheetByName(SHEET_NAMES[table]);
  if (!sheet) return;

  const headers = TABLE_HEADERS[table];
  const lastRow = sheet.getLastRow();
  const rowValues = headers.map(h => {
    let val = record[h];
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return val;
  });

  if (lastRow < 2) {
    sheet.appendRow(rowValues);
    return;
  }

  // Stage 6: TextFinder mencari ID langsung di kolom A.
  // Tidak perlu memuat seluruh kolom ID ke array JavaScript.
  const idRange = sheet.getRange(2, 1, lastRow - 1, 1);
  const found = idRange.createTextFinder(String(record.id))
    .matchEntireCell(true)
    .matchCase(true)
    .useRegularExpression(false)
    .findNext();

  if (found) {
    sheet.getRange(found.getRow(), 1, 1, headers.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function deleteRecord(ss, table, id) {
  if (!table || !id || !SHEET_NAMES[table]) return false;
  const sheet = ss.getSheetByName(SHEET_NAMES[table]);
  if (!sheet || sheet.getLastRow() < 2) return false;

  const idRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1);
  const found = idRange.createTextFinder(String(id))
    .matchEntireCell(true)
    .matchCase(true)
    .useRegularExpression(false)
    .findNext();

  if (!found) return false;

  sheet.deleteRow(found.getRow());
  return true;
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
