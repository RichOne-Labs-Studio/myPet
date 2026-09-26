/**
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
const COUNTS_CACHE_KEY = 'mypet_counts_v1';
const COUNTS_CACHE_TS_KEY = 'mypet_counts_ts_v1';

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

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const action = e && e.parameter && e.parameter.action ? e.parameter.action : 'ping';

  if (action === 'version') {
    return createJsonResponse({
      status: 'success',
      stage: '6.2',
      deploymentMarker: 'STAGE-6.2-MONITORING',
      queryResultCache: false,
      countCache: true,
      textFinderUpsert: true,
      textFinderDelete: true,
      timestamp: new Date().toISOString()
    });
  }

  if (action === 'health') {
    const counts = {};
    let totalRecords = 0;
    let largestTable = null;
    const warnings = [];
    const threshold = 20000;

    Object.keys(SHEET_NAMES).forEach(table => {
      const sheet = ss.getSheetByName(SHEET_NAMES[table]);
      const count = sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
      counts[table] = count;
      totalRecords += count;
      if (!largestTable || count > largestTable.count) largestTable = { table: table, count: count };
    });

    const usagePercent = Math.round((totalRecords / threshold) * 10000) / 100;
    if (totalRecords >= threshold) {
      warnings.push('Total record mencapai/melewati ambang large-data browser: ' + threshold + '.');
    } else if (totalRecords >= threshold * 0.8) {
      warnings.push('Total record sudah mencapai >=80% ambang large-data browser: ' + threshold + '.');
    }
    if (largestTable && largestTable.count >= 10000) {
      warnings.push('Tabel terbesar sudah >=10.000 record: ' + largestTable.table + '.');
    }

    return createJsonResponse({
      status: 'success',
      stage: '6.2',
      deploymentMarker: 'STAGE-6.2-MONITORING',
      counts: counts,
      totalRecords: totalRecords,
      threshold: threshold,
      usagePercent: usagePercent,
      largestTable: largestTable,
      warnings: warnings,
      timestamp: new Date().toISOString()
    });
  }


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
    const result = queryTableDataUncached(ss, table, offset, limit, filters);

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

        const phoneLikeSearch = /^[0-9+\\-\\s().]+$/.test(String(filters && filters.search || '').trim());
        const digits = phoneLikeSearch ? search.replace(/\\D/g, '') : '';
        const phone = phoneLikeSearch ? String(row[idx.ownerwhatsapp] ?? '').replace(/\\D/g, '') : '';
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
}

function writeTableData(ss, table, rows) {
  const sheetName = SHEET_NAMES[table];
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  const headers = TABLE_HEADERS[table];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const incomingRows = Array.isArray(rows) ? rows : [];
  if (incomingRows.length === 0) return;

  const existingSheetRows = readTableData(ss, table);
  const incomingMap = {};
  incomingRows.forEach(function(row) {
    if (row && row.id) incomingMap[String(row.id).trim()] = row;
  });

  const mergedRows = incomingRows.slice();
  if (table !== 'cages') {
    existingSheetRows.forEach(function(sheetRow) {
      if (!sheetRow) return;
      const id = String(sheetRow.id || '').trim();
      if (id && !incomingMap[id]) mergedRows.push(sheetRow);
    });
  }

  const matrix = mergedRows.map(function(item) {
    return headers.map(function(h) {
      const val = item[h];
      if (val === null || val === undefined) return '';
      return typeof val === 'object' ? JSON.stringify(val) : val;
    });
  });

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  sheet.getRange(2, 1, matrix.length, headers.length).setValues(matrix);
}

function upsertRecord(ss, table, record) {
  if (!record || !record.id || !SHEET_NAMES[table]) return;
  const sheet = ss.getSheetByName(SHEET_NAMES[table]);
  if (!sheet) return;

  const headers = TABLE_HEADERS[table];
  const rowValues = headers.map(function(h) {
    const val = record[h];
    if (val === null || val === undefined) return '';
    return typeof val === 'object' ? JSON.stringify(val) : val;
  });

  const textFinder = sheet.getRange(2, 1, Math.max(1, sheet.getMaxRows() - 1), 1)
    .createTextFinder(String(record.id))
    .matchEntireCell(true)
    .matchCase(false);

  const found = textFinder.findNext();
  if (found) {
    sheet.getRange(found.getRow(), 1, 1, headers.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function deleteRecord(ss, table, id) {
  if (!id || !SHEET_NAMES[table]) return false;
  const sheet = ss.getSheetByName(SHEET_NAMES[table]);
  if (!sheet || sheet.getLastRow() < 2) return false;

  const found = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(String(id))
    .matchEntireCell(true)
    .matchCase(false)
    .findNext();

  if (!found) return false;
  sheet.deleteRow(found.getRow());
  return true;
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON); 
}
