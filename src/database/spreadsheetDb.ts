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
    const timeoutId = setTimeout(() => controller.abort(), 12000);

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
    const timeoutId = setTimeout(() => controller.abort(), 20000);
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
      return { success: false, message: 'Koneksi timeout setelah 2x percobaan (20 detik). Apps Script sedang lambat merespons.' };
    }
    return {
      success: false,
      message: `Error penarikan data: ${err.message || 'Koneksi terputus'}`,
    };
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

function readTableData(ss, table) {
  const sheetName = SHEET_NAMES[table];
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];

  const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
  const dataRows = dataRange.getValues();

  // Cari kolom 'id' (case-insensitive) supaya baris yang diinput manual
  // di Google Sheets tanpa kolom id bisa diberi ID permanen.
  const idColIdx = headerRow.findIndex(h => String(h).trim().toLowerCase() === 'id');
  const prefix = String(table).slice(0, 3).toLowerCase();
  let idsWereAssigned = false;

  const results = dataRows.map((row, rowIdx) => {
    // Jangan generate otomatis ID untuk kandang (cages) agar unit kandang tidak terisi otomatis di spreadsheet
    if (idColIdx !== -1 && table !== 'cages') {
      const idVal = row[idColIdx];
      const rowHasOtherData = row.some((v, idx) => idx !== idColIdx && v !== '' && v !== null && v !== undefined);
      if (rowHasOtherData && (idVal === '' || idVal === null || idVal === undefined)) {
        // Tulis ID baru LANGSUNG ke array baris (akan disimpan balik ke sheet di bawah),
        // supaya stabil selamanya dan tidak berubah-ubah tiap kali di-fetch ulang.
        row[idColIdx] = prefix + '-' + Date.now() + '-' + rowIdx + '-' + Math.floor(Math.random() * 1000);
        idsWereAssigned = true;
      }
    }

    const item = {};
    headerRow.forEach((headerName, idx) => {
      if (!headerName) return;
      let val = row[idx];
      
      // Jika tipe data adalah Date di Google Sheets, konversi ke string berformat lokal spreadsheet-nya
      // untuk mencegah pergeseran zona waktu saat Apps Script mengonversinya ke JSON / ISO UTC string.
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
    // Hanya sertakan baris yang memiliki nilai (bukan baris kosong/terhapus)
    return Object.values(item).some(val => val !== '' && val !== null && val !== undefined);
  });

  // Simpan ID yang baru di-generate balik ke spreadsheet supaya permanen
  if (idsWereAssigned) {
    dataRange.setValues(dataRows);
  }

  return results;
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

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(r => String(r[0]));
  const existingIndex = ids.indexOf(String(record.id));

  if (existingIndex !== -1) {
    sheet.getRange(existingIndex + 2, 1, 1, headers.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
