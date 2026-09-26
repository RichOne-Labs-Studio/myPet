import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  Owner,
  Pet,
  VisitQueue,
  SoapRecord,
  InpatientCage,
  InpatientHistoryRecord,
  InventoryItem,
  BookingAppointment,
  StaffUser,
  StaffRole,
  CustomerFeedback,
  PrescriptionItem,
  DiagnosticAttachment,
  InpatientObservation,
  PetType,
  ServiceType,
  CageStatus,
  SpreadsheetConfig,
  SyncStatus
} from '../types';
import {
  INITIAL_STAFF,
  INITIAL_OWNERS,
  INITIAL_PETS,
  INITIAL_QUEUES,
  INITIAL_INVENTORY,
  INITIAL_SOAP_RECORDS,
  INITIAL_CAGES,
  INITIAL_BOOKINGS,
  INITIAL_FEEDBACKS,
} from '../mockData';
import {
  DEFAULT_SPREADSHEET_CONFIG,
  SpreadsheetDatabaseSchema,
  testSpreadsheetConnection,
  pullFullDatabaseFromSpreadsheet,
  pullTablesBatchFromSpreadsheet,
  pushFullDatabaseToSpreadsheet,
  pushTableToSpreadsheet,
  pushSingleRecordToSpreadsheet,
} from '../database/spreadsheetDb';
import {
  fetchDatabaseFromBackend,
  fetchBootstrapFromBackend,
  fetchStatusFromBackend,
  triggerBackendSync,
  pushRecordToBackend,
  deleteRecordFromBackend,
  pushTableToBackend,
  updateBackendConfig,
} from '../database/backendSyncClient';
import { normalizePhoneWithZero } from '../utils/phoneUtils';
import { decryptPhotoUrl, decryptDiagnosticAttachments } from '../utils/cryptoUtils';
import { normalizeCageId, sanitizeCagesList } from '../utils/cageUtils';
import { getRegistrationTimestamp, isToday, convertAmPmTo24h, sanitizeIsoToLocalString } from '../utils/dateUtils';
import { generateSequentialId, generateNextTicketNumber } from '../utils/idGenerator';
import { getIdbItem, setIdbItem, clearAllIdb } from '../utils/idbStorage';

/**
 * Auto-sync SATU tabel ke Google Spreadsheet, dengan debounce sendiri per tabel.
 * Menghindari echo-loop saat data baru ditarik dari Google Sheets menggunakan isRemoteSyncRef.
 */
function useAutoSyncTable<T extends { id?: string | number }>(
  table: keyof SpreadsheetDatabaseSchema,
  value: T[],
  config: SpreadsheetConfig,
  setSyncStatus: React.Dispatch<React.SetStateAction<SyncStatus>>,
  setLastSyncMessage: React.Dispatch<React.SetStateAction<string | null>>,
  markSynced: (nowStr: string) => void,
  isRemoteSyncRef: React.MutableRefObject<boolean>,
  hasInitialSyncedRef: React.MutableRefObject<boolean>
) {
  /**
   * Large-data optimization:
   * - NEVER JSON.stringify the whole table on every React render/update.
   * - NEVER re-upload the whole table when one record changes.
   * - Detect changes by object reference + stable id, then sync only changed/deleted rows.
   *
   * This keeps the UI state compatible with the existing screens while reducing the
   * CPU, memory and network cost of editing a single row in a 100k+ row dataset.
   */
  const previousRecordsRef = useRef<Map<string, T>>(new Map());
  const firstRun = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (firstRun.current) {
      const initial = new Map<string, T>();
      for (const item of value) {
        if (item?.id !== undefined && item?.id !== null && String(item.id)) {
          initial.set(String(item.id), item);
        }
      }
      previousRecordsRef.current = initial;
      firstRun.current = false;
      return;
    }

    if (!config.isConnected || !config.autoSync || !config.webAppUrl || !hasInitialSyncedRef.current) {
      const snapshot = new Map<string, T>();
      for (const item of value) {
        if (item?.id !== undefined && item?.id !== null && String(item.id)) {
          snapshot.set(String(item.id), item);
        }
      }
      previousRecordsRef.current = snapshot;
      return;
    }

    // Remote sync replaces/clones large arrays. Do not interpret that as thousands
    // of local edits that need to be uploaded again.
    if (isRemoteSyncRef.current) {
      const snapshot = new Map<string, T>();
      for (const item of value) {
        if (item?.id !== undefined && item?.id !== null && String(item.id)) {
          snapshot.set(String(item.id), item);
        }
      }
      previousRecordsRef.current = snapshot;
      return;
    }

    // Vital tables must never be pushed as an accidental empty dataset.
    if (value.length === 0 && ['owners', 'pets', 'cages', 'staff', 'soapRecords'].includes(String(table))) {
      return;
    }

    const previous = previousRecordsRef.current;
    const current = new Map<string, T>();
    const changed: T[] = [];
    const deleted: string[] = [];

    for (const item of value) {
      if (item?.id === undefined || item?.id === null || String(item.id) === '') continue;
      const id = String(item.id);
      current.set(id, item);

      // React state updates create a new object only for the row that changed.
      // Unchanged 100k rows keep their references, so no deep serialization is needed.
      if (previous.get(id) !== item) {
        changed.push(item);
      }
    }

    for (const [id] of previous) {
      if (!current.has(id)) deleted.push(id);
    }

    previousRecordsRef.current = current;

    if (changed.length === 0 && deleted.length === 0) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        setSyncStatus('syncing');

        // Small batches prevent a burst of edits from generating one request per row.
        const batchSize = 20;
        for (let i = 0; i < changed.length; i += batchSize) {
          const batch = changed.slice(i, i + batchSize);
          await Promise.all(
            batch.map((record) => pushSingleRecordToSpreadsheet(config.webAppUrl, table, record as any))
          );
        }

        for (const id of deleted) {
          // GitHub Pages has no Express /api backend, so delete directly through Apps Script.
          // Hosted deployments with the Express backend keep using the backend deletion path.
          const staticHost =
            typeof window !== 'undefined' &&
            (window.location.hostname.endsWith('.github.io') ||
              window.location.hostname === 'localhost' ||
              window.location.hostname === '127.0.0.1');

          try {
            if (staticHost && config.webAppUrl) {
              await fetch(config.webAppUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'delete', table, id }),
              });
            } else {
              await fetch('/api/sync/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table, id }),
              });
            }
          } catch {
            // Keep UI responsive; the next sync can reconcile the row.
          }
        }

        const nowStr = new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit', minute: '2-digit', hour12: false,
        });
        markSynced(nowStr);
        setSyncStatus('connected');
        setLastSyncMessage(
          `Perubahan ${table}: ${changed.length} data diperbarui, ${deleted.length} dihapus (${nowStr} WIB)`
        );
      } catch (err: any) {
        setSyncStatus('error');
        setLastSyncMessage(err?.message || 'Auto-sync gagal');
      }
    }, 1000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // Intentionally depends on the array reference/config, not its serialized contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, config.isConnected, config.autoSync, config.webAppUrl]);
}

interface RegisterData {
  owner: {
    name: string;
    whatsapp: string;
    address: string;
  };
  pet: {
    name: string;
    type: PetType;
    breed: string;
    ageOrDob: string;
    sex: 'Jantan' | 'Betina';
    photoUrl?: string;
  };
  visit: {
    chiefComplaint: string;
    serviceType: ServiceType;
  };
  informedConsent?: string;
}

interface CallNotification {
  ticketNumber: string;
  petName: string;
  ownerName: string;
  room: string;
  timestamp: string;
}

interface ClinicContextType {
  owners: Owner[];
  pets: Pet[];
  queues: VisitQueue[];
  inventory: InventoryItem[];
  cages: InpatientCage[];
  inpatientHistory: InpatientHistoryRecord[];
  soapRecords: SoapRecord[];
  bookings: BookingAppointment[];
  feedbacks: CustomerFeedback[];
  staffList: StaffUser[];
  currentUser: StaffUser | null;
  currentServingTicket: string;
  activePatientTicket: string | null;
  callNotification: CallNotification | null;

  // Spreadsheet Database Connection & Sync
  spreadsheetConfig: SpreadsheetConfig;
  syncStatus: SyncStatus;
  /** True when the remote dataset is large enough to use lazy/remote loading. */
  isLargeDataMode: boolean;
  lastSyncMessage: string | null;
  connectSpreadsheet: (url: string) => Promise<{ success: boolean; message: string }>;
  disconnectSpreadsheet: () => void;
  updateSpreadsheetConfig: (partial: Partial<SpreadsheetConfig>) => void;
  syncToSpreadsheet: (customDb?: SpreadsheetDatabaseSchema) => Promise<{ success: boolean; message: string }>;
  syncFromSpreadsheet: (silent?: boolean) => Promise<{ success: boolean; message: string }>;
  importDatabase: (data: Partial<SpreadsheetDatabaseSchema>) => void;
  clearAllData: () => void;

  // Patient & Clinical Actions
  registerPatient: (data: RegisterData) => string;
  callQueue: (queueId: string, room?: string) => void;
  completeQueue: (queueId: string) => void;
  deleteQueue: (queueId: string) => void;
  deleteOwner: (ownerId: string) => void;
  deletePet: (petId: string) => void;
  deleteSoapRecord: (recordId: string) => void;
  saveSoapRecord: (
    record: Omit<SoapRecord, 'id' | 'date'>,
    prescriptionItems: PrescriptionItem[]
  ) => void;
  updateCageStatus: (cageId: string, status: CageStatus, petId?: string) => void;
  addCageObservation: (cageId: string, obs: Omit<InpatientObservation, 'id'>) => void;
  admitPetToCage: (cageId: string, pet: Pet, owner: Owner, diagnosis: string, vet: string) => void;
  dischargeCage: (cageId: string) => void;
  restockItem: (itemId: string, addedQuantity: number) => void;
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'lastRestocked'>) => void;
  updateInventoryItem: (itemId: string, updatedData: Partial<InventoryItem>) => void;
  deleteInventoryItem: (itemId: string) => void;
  addBooking: (booking: Omit<BookingAppointment, 'id'>) => void;
  updateBookingStatus: (id: string, status: BookingAppointment['status']) => void;
  addFeedback: (feedback: Omit<CustomerFeedback, 'id' | 'submittedAt'>) => void;
  deleteFeedback: (id: string) => void;
  addStaff: (staff: Omit<StaffUser, 'id'>) => { success: boolean; message: string };
  deleteStaff: (id: string) => { success: boolean; message: string };
  updateStaff: (id: string, updatedData: Partial<StaffUser>) => { success: boolean; message: string };
  updateStaffPassword: (id: string, newPassword: string) => { success: boolean; message: string };
  loginStaff: (username: string, password: string) => { success: boolean; message: string };
  logoutStaff: () => void;
  setTrackedTicket: (ticket: string) => boolean;
  trackByPhone: (phone: string) => boolean;
  clearPatientSession: () => void;
  dismissCallNotification: () => void;
  getPetById: (id: string) => Pet | undefined;
  getOwnerByPhone: (phone: string) => Owner | undefined;
  getPetsByOwnerPhone: (phone: string | number, ownerId?: string) => Pet[];
  resetToInitialData: () => void;
  updateOwner: (ownerId: string, updatedData: Partial<Owner>) => void;
  updatePet: (petId: string, updatedData: Partial<Pet>) => void;
  sanitizeAllExistingDates: () => SpreadsheetDatabaseSchema;
}

const ClinicContext = createContext<ClinicContextType | undefined>(undefined);

const DB_VERSION_KEY = 'vetcare_clean_db_v2';

const STORAGE_KEYS = {
  OWNERS: 'vetcare_owners',
  PETS: 'vetcare_pets',
  QUEUES: 'vetcare_queues',
  INVENTORY: 'vetcare_inventory',
  CAGES: 'vetcare_cages',
  INPATIENT_HISTORY: 'vetcare_inpatient_history',
  SOAP: 'vetcare_soap',
  BOOKINGS: 'vetcare_bookings',
  FEEDBACKS: 'vetcare_feedbacks',
  STAFF_LIST: 'vetcare_staff_list',
  STAFF_USER: 'vetcare_current_staff',
  SERVING_TICKET: 'vetcare_serving_ticket',
  ACTIVE_PATIENT: 'vetcare_active_patient_ticket',
  SPREADSHEET_CONFIG: 'vetcare_spreadsheet_config',
};

// Purge any legacy dummy data once on version bump
if (typeof window !== 'undefined') {
  try {
    const currentVer = localStorage.getItem(DB_VERSION_KEY);
    if (currentVer !== 'v2') {
      localStorage.removeItem(STORAGE_KEYS.OWNERS);
      localStorage.removeItem(STORAGE_KEYS.PETS);
      localStorage.removeItem(STORAGE_KEYS.QUEUES);
      localStorage.removeItem(STORAGE_KEYS.INVENTORY);
      localStorage.removeItem(STORAGE_KEYS.CAGES);
      localStorage.removeItem(STORAGE_KEYS.SOAP);
      localStorage.removeItem(STORAGE_KEYS.BOOKINGS);
      localStorage.removeItem(STORAGE_KEYS.FEEDBACKS);
      localStorage.removeItem(STORAGE_KEYS.SERVING_TICKET);
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_PATIENT);
      localStorage.setItem(DB_VERSION_KEY, 'v2');
    }
  } catch {
    // Ignore storage check failures
  }
}

function loadStored<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Static browser hosts (GitHub Pages / local preview) use Google Sheets as the
 * authoritative startup source. Avoid parsing large persisted datasets before
 * the authoritative remote read completes.
 */
function isStaticBrowserHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host.endsWith('.github.io') || host === 'localhost' || host === '127.0.0.1';
}

/**
 * Menghasilkan ID deterministik (stabil) dari kombinasi field yang ada di baris data.
 * Dipakai sebagai fallback saat kolom 'id' kosong di Google Sheets (mis. data diketik manual),
 * supaya ID tidak berubah-ubah setiap kali data ditarik ulang (Date.now() akan selalu beda tiap fetch).
 */
function stableIdFrom(prefix: string, parts: Array<string | number | undefined | null>): string {
  const seed = parts.map((p) => String(p ?? '').trim().toLowerCase()).join('|');
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return `${prefix}-${Math.abs(hash).toString(36)}`;
}

function sanitizeOwner(o: any): Owner | null {
  if (!o || typeof o !== 'object') return null;
  const id = String(o?.id || o?.ID || o?.Id || o?.['ID Pemilik'] || o?.['Kode Pemilik'] || '').trim();
  const name = String(
    o?.name ||
      o?.nama ||
      o?.Nama ||
      o?.['Nama Pemilik'] ||
      o?.['Nama Lengkap'] ||
      o?.['Nama Owner'] ||
      o?.pemilik ||
      o?.owner ||
      ''
  ).trim();
  const rawWa =
    o?.whatsapp ||
    o?.WhatsApp ||
    o?.['No WA'] ||
    o?.['No. WA'] ||
    o?.['No WhatsApp'] ||
    o?.['No. WhatsApp'] ||
    o?.['Nomor WA'] ||
    o?.['Nomor WhatsApp'] ||
    o?.wa ||
    o?.phone ||
    o?.hp ||
    o?.['No HP'] ||
    o?.['No. HP'] ||
    o?.telepon ||
    o?.kontak;
  const whatsapp = normalizePhoneWithZero(rawWa);
  const address = String(o?.address || o?.alamat || o?.Alamat || o?.['Alamat Lengkap'] || o?.domisili || '').trim();
  // Baris kosong tanpa ID, nama, dan no WhatsApp tidak dianggap sebagai pemilik valid
  if (!id && !name && !whatsapp) return null;

  const notesVal = String(
    o?.notes ||
      o?.Catatan ||
      o?.catatan ||
      o?.keterangan ||
      o?.informedConsent ||
      'Persetujuan Tindakan Medis & Pemeriksaan Klinik Terstandar disetujui oleh pemilik.'
  );
  return {
    ...o,
    id: id || stableIdFrom('own', [name, whatsapp, address]),
    name: name || 'Pemilik',
    whatsapp,
    address,
    registeredAt: convertAmPmTo24h(String(o?.registeredAt || o?.['Tanggal Daftar'] || o?.['Tgl Daftar'] || o?.['Tanggal Registrasi'] || '')),
    notes: notesVal,
    informedConsent: notesVal,
  };
}

function sanitizePet(p: any, ownerLookupMap?: Map<string, Owner>): Pet | null {
  if (!p || typeof p !== 'object') return null;

  const rawOwnerNameStr = String(p?.ownerName ?? '').trim();
  const rawOwnerWaStr = String(p?.ownerWhatsapp ?? '').trim();
  const rawNameStr = String(p?.name ?? '').trim();
  const rawPhotoStr = String(p?.photoUrl ?? '').trim();
  const rawAgeOrDobStr = String(p?.ageOrDob ?? '').trim();
  const rawSexVal = p?.sex;

  // Deteksi pergeseran kolom (column shift) di sheet Google Sheets '2_Pasien':
  // Pada pergeseran ini:
  // - p.ownerName berisi nomor HP (contoh: 89652700068 / 81802310800)
  // - p.ownerWhatsapp berisi nama hewan sebenarnya (contoh: 'Hima', 'Cika', 'XX', 'Abundut')
  // - p.name berisi jenis hewan (contoh: 'Kucing', 'Anjing')
  // - p.photoUrl berisi tanggal/ISO timestamp pendaftaran (contoh: '2026-08-03T...')
  // - p.sex berisi angka bobot (kg) atau p.ageOrDob berisi 'Jantan'/'Betina'
  const isOwnerNamePhone = /^[0-9+]+$/.test(rawOwnerNameStr) && rawOwnerNameStr.length >= 3;
  const isOwnerWaTextNotPhone = rawOwnerWaStr !== '' && !/^[0-9+\s()-]+$/.test(rawOwnerWaStr);
  const isNameSpecies = /^(kucing|anjing|cat|dog|kelinci|rabbit|hamster|burung|iguana|musang|sugar glider)$/i.test(rawNameStr);
  const isPhotoUrlDate = /^\d{4}-\d{2}-\d{2}/.test(rawPhotoStr);
  const isAgeSexMismatch =
    /^(jantan|betina|male|female)$/i.test(rawAgeOrDobStr) &&
    (typeof rawSexVal === 'number' || /^\d+(\.\d+)?$/.test(String(rawSexVal)));

  const isShifted =
    (isOwnerNamePhone && (isOwnerWaTextNotPhone || isNameSpecies)) ||
    (isNameSpecies && isPhotoUrlDate) ||
    (isOwnerNamePhone && isPhotoUrlDate) ||
    (isAgeSexMismatch && isNameSpecies);

  let id = String(p?.id || p?.ID || p?.Id || '').trim();
  let ownerId = p?.ownerId ? String(p.ownerId).trim() : undefined;
  let ownerName = p?.ownerName ? String(p.ownerName).trim() : undefined;
  const rawOwnerWa =
    p?.ownerWhatsapp ||
    p?.whatsapp ||
    p?.['No WA'] ||
    p?.['No. WA'] ||
    p?.['WhatsApp Pemilik'] ||
    p?.['No WhatsApp'];
  let ownerWhatsapp = normalizePhoneWithZero(rawOwnerWa);
  let name = String(
    p?.name || p?.nama || p?.['Nama Pasien'] || p?.['Nama Hewan'] || p?.['Nama'] || ''
  ).trim();
  let type = p?.type || p?.jenis || p?.['Jenis Hewan'] || 'Cat';
  let breed = String(p?.breed || p?.ras || p?.Ras || '');
  let ageOrDob = String(p?.ageOrDob || p?.umur || p?.Umur || '');
  let sex = p?.sex || p?.['Jenis Kelamin'] || 'Jantan';
  let weight = typeof p?.weight === 'number' ? p.weight : parseFloat(p?.weight || p?.berat) || 0;
  let photoUrl = p?.photoUrl ? decryptPhotoUrl(String(p.photoUrl)) : undefined;
  let status = p?.status || p?.Status || 'Sehat';
  let registeredAt = convertAmPmTo24h(String(p?.registeredAt || p?.['Tanggal Terdaftar'] || ''));
  let notes = p?.notes ? String(p.notes) : undefined;
  let informedConsent = p?.informedConsent ? String(p.informedConsent) : undefined;

  if (isShifted) {
    // Kembalikan ke susunan atribut yang sebenarnya:
    ownerWhatsapp = normalizePhoneWithZero(rawOwnerNameStr);
    name = rawOwnerWaStr || 'Pasien';
    type = rawNameStr || 'Cat';
    breed = String(p?.type || '').trim();
    ageOrDob = String(p?.breed || '').trim();
    sex = /^(jantan|betina)$/i.test(rawAgeOrDobStr)
      ? ((rawAgeOrDobStr.charAt(0).toUpperCase() + rawAgeOrDobStr.slice(1).toLowerCase()) as any)
      : 'Jantan';
    weight = typeof rawSexVal === 'number' ? rawSexVal : parseFloat(rawSexVal) || 0;
    status = String(p?.weight || 'Sehat').trim();
    registeredAt = convertAmPmTo24h(rawPhotoStr || '');
    photoUrl = undefined;
    ownerName = undefined; // Di-lookup di bawah
  }

  // Cari nama pemilik dari ownerLookupMap jika ada
  if (ownerLookupMap) {
    let matchedOwner: Owner | undefined;
    if (ownerId && ownerLookupMap.has(ownerId)) {
      matchedOwner = ownerLookupMap.get(ownerId);
    }
    if (!matchedOwner && ownerWhatsapp) {
      const cleanDigits = ownerWhatsapp.replace(/\D/g, '');
      if (cleanDigits && ownerLookupMap.has(cleanDigits)) {
        matchedOwner = ownerLookupMap.get(cleanDigits);
      }
    }
    if (matchedOwner) {
      if (!ownerId) ownerId = matchedOwner.id;
      ownerName = matchedOwner.name;
      if (!ownerWhatsapp) ownerWhatsapp = normalizePhoneWithZero(matchedOwner.whatsapp);
    }
  }

  if (!id && !name && !ownerWhatsapp && !ownerId) return null;

  return {
    ...p,
    id: id || stableIdFrom('pet', [name, ownerWhatsapp, ownerName, registeredAt]),
    ownerId,
    ownerName,
    ownerWhatsapp,
    name: name || 'Pasien',
    type,
    breed,
    ageOrDob,
    sex,
    weight,
    photoUrl,
    status,
    registeredAt,
    notes,
    informedConsent,
  };
}

function sanitizeQueue(q: any): VisitQueue | null {
  if (!q || typeof q !== 'object') return null;
  const id = String(q?.id || q?.ID || '').trim();
  const ticketNumber = String(q?.ticketNumber || q?.['No Antrean'] || q?.['Nomor Tiket'] || q?.ticket || '').trim();
  const petName = String(q?.petName || q?.pasien || q?.['Nama Pasien'] || q?.['Nama Hewan'] || '').trim();
  const ownerName = String(q?.ownerName || q?.pemilik || q?.['Nama Pemilik'] || '').trim();
  if (!id && !ticketNumber && !petName && !ownerName) return null;

  const rawPhoto = q?.photoUrl || q?.foto || q?.['Foto'];
  const photoUrl = rawPhoto ? decryptPhotoUrl(String(rawPhoto)) : undefined;

  return {
    ...q,
    id: id || stableIdFrom('q', [ticketNumber, petName, ownerName, q?.createdAt]),
    ticketNumber: ticketNumber || 'A-00',
    ownerWhatsapp: normalizePhoneWithZero(q?.ownerWhatsapp || q?.whatsapp || q?.['No WA']),
    ownerName: ownerName || 'Pemilik',
    petId: String(q?.petId || ''),
    petName: petName || 'Pasien',
    petType: q?.petType || q?.type || q?.['Jenis Hewan'] || 'Cat',
    photoUrl,
    serviceType: q?.serviceType || q?.layanan || q?.['Jenis Layanan'] || 'Consultation',
    chiefComplaint: String(q?.chiefComplaint || q?.keluhan || q?.['Keluhan Utama'] || ''),
    status: q?.status || q?.Status || 'Menunggu',
    createdAt: convertAmPmTo24h(String(q?.createdAt || q?.['Tanggal Dibuat'] || '')),
    completedAt: q?.completedAt ? convertAmPmTo24h(String(q.completedAt)) : undefined,
    assignedDoctor: q?.assignedDoctor ? String(q.assignedDoctor) : undefined,
    informedConsent: q?.informedConsent ? String(q.informedConsent) : undefined,
  };
}

function saveStored<T>(key: string, value: T) {
  // Always persist into IndexedDB (supports 100k+ records and 100MB+ without 5MB quota errors)
  setIdbItem(key, value).catch(() => {});

  // For lightweight session state, also sync with localStorage for immediate synchronous reads
  if (
    key === STORAGE_KEYS.STAFF_USER ||
    key === STORAGE_KEYS.SERVING_TICKET ||
    key === STORAGE_KEYS.ACTIVE_PATIENT ||
    key === STORAGE_KEYS.SPREADSHEET_CONFIG
  ) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore quota error for small keys
    }
  }
}

/**
 * Memastikan field bertipe array/objek (prescriptions, vitals, soap, diagnosticAttachments)
 * selalu berbentuk benar walau sel di Google Sheets kosong atau rusak formatnya
 * (biasanya tersimpan sebagai string mentah kalau bukan JSON valid). Mencegah error
 * "x.map is not a function" saat komponen merender data ini.
 */
function coerceArray<T>(val: any): T[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // bukan JSON valid, abaikan dan kembalikan array kosong
    }
  }
  return [];
}

function coerceObject<T extends Record<string, any>>(val: any, defaults: T): T {
  if (val && typeof val === 'object' && !Array.isArray(val)) return { ...defaults, ...val };
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { ...defaults, ...parsed };
    } catch {
      // bukan JSON valid, abaikan dan kembalikan default
    }
  }
  return { ...defaults };
}

function sanitizeSoapRecord(s: any): SoapRecord | null {
  if (!s || typeof s !== 'object') return null;
  if (!s.id && !s.petName && !s.petId) return null;

  const dateStr = convertAmPmTo24h(s.date || s['Tanggal'] || '');
  return {
    ...s,
    id: s.id ? String(s.id).trim() : stableIdFrom('soap', [s.petId, s.petName, dateStr, s.veterinarian]),
    date: dateStr,
    prescriptions: coerceArray<PrescriptionItem>(s.prescriptions),
    diagnosticAttachments: s.diagnosticAttachments !== undefined ? decryptDiagnosticAttachments(s.diagnosticAttachments) : undefined,
    vitals: coerceObject(s.vitals, { weight: 0, temperature: 0, heartRate: 0, respiratoryRate: 0 }),
    soap: coerceObject(s.soap, { subjective: '', objective: '', assessment: '', plan: '' }),
  };
}

export const ClinicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [owners, setOwners] = useState<Owner[]>(() => {
    if (isStaticBrowserHost()) return [];
    const raw = loadStored(STORAGE_KEYS.OWNERS, INITIAL_OWNERS);
    return Array.isArray(raw) ? (raw.map(sanitizeOwner).filter((x): x is Owner => x !== null)) : INITIAL_OWNERS;
  });
  const [pets, setPets] = useState<Pet[]>(() => {
    if (isStaticBrowserHost()) return [];
    const raw = loadStored(STORAGE_KEYS.PETS, INITIAL_PETS);
    return Array.isArray(raw) ? raw.map((p) => sanitizePet(p)).filter((x): x is Pet => x !== null) : INITIAL_PETS;
  });
  const [queues, setQueues] = useState<VisitQueue[]>(() => {
    const raw = loadStored(STORAGE_KEYS.QUEUES, INITIAL_QUEUES);
    return Array.isArray(raw) ? (raw.map(sanitizeQueue).filter((x): x is VisitQueue => x !== null)) : INITIAL_QUEUES;
  });
  const [inventory, setInventory] = useState<InventoryItem[]>(() => loadStored(STORAGE_KEYS.INVENTORY, INITIAL_INVENTORY));
  const [cages, setCages] = useState<InpatientCage[]>(() => sanitizeCagesList(loadStored(STORAGE_KEYS.CAGES, INITIAL_CAGES)));
  const [inpatientHistory, setInpatientHistory] = useState<InpatientHistoryRecord[]>(() => loadStored(STORAGE_KEYS.INPATIENT_HISTORY, []));
  const [soapRecords, setSoapRecords] = useState<SoapRecord[]>(() => {
    if (isStaticBrowserHost()) return [];
    const raw = loadStored(STORAGE_KEYS.SOAP, INITIAL_SOAP_RECORDS);
    return Array.isArray(raw) ? (raw.map(sanitizeSoapRecord).filter((x): x is SoapRecord => x !== null)) : INITIAL_SOAP_RECORDS;
  });
  const [bookings, setBookings] = useState<BookingAppointment[]>(() => loadStored(STORAGE_KEYS.BOOKINGS, INITIAL_BOOKINGS));
  const [feedbacks, setFeedbacks] = useState<CustomerFeedback[]>(() => loadStored(STORAGE_KEYS.FEEDBACKS, INITIAL_FEEDBACKS));
  const [staffList, setStaffList] = useState<StaffUser[]>(() => {
    const list = loadStored<StaffUser[]>(STORAGE_KEYS.STAFF_LIST, INITIAL_STAFF);
    if (!Array.isArray(list) || list.length === 0) return INITIAL_STAFF;
    const hasOwner = list.some((s) => s.username.toLowerCase() === 'owner' || String(s.role || '').toLowerCase().includes('owner') || String(s.role || '').toLowerCase().includes('super'));
    if (!hasOwner) {
      const ownerAccount = INITIAL_STAFF.find((s) => s.username === 'owner') || INITIAL_STAFF[0];
      return [ownerAccount, ...list];
    }
    return list;
  });
  const [currentUser, setCurrentUser] = useState<StaffUser | null>(() => loadStored(STORAGE_KEYS.STAFF_USER, null));
  const [currentServingTicket, setCurrentServingTicket] = useState<string>(() => loadStored(STORAGE_KEYS.SERVING_TICKET, '-'));
  const [activePatientTicket, setActivePatientTicket] = useState<string | null>(() => loadStored(STORAGE_KEYS.ACTIVE_PATIENT, null));
  const [callNotification, setCallNotification] = useState<CallNotification | null>(null);

  // Spreadsheet Database State
  const [spreadsheetConfig, setSpreadsheetConfig] = useState<SpreadsheetConfig>(() => {
    const stored = loadStored<SpreadsheetConfig>(STORAGE_KEYS.SPREADSHEET_CONFIG, DEFAULT_SPREADSHEET_CONFIG);
    if (!stored || !stored.webAppUrl || stored.webAppUrl !== DEFAULT_SPREADSHEET_CONFIG.webAppUrl) {
      return DEFAULT_SPREADSHEET_CONFIG;
    }
    return stored;
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    spreadsheetConfig.isConnected ? 'connected' : 'idle'
  );
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);
  // Browser tidak memuat seluruh tabel saat dataset besar.
  const [isLargeDataMode, setIsLargeDataMode] = useState(false);
  const LARGE_DATA_THRESHOLD = 20000;

  // GitHub Pages is the production static host. On static hosting, Google Sheets
  // via Apps Script is the single source of truth for READ operations.
  const isStaticHost = isStaticBrowserHost();

  // Versi backend lokal untuk mendeteksi pembaruan data secara otomatis
  const localBackendVersionRef = useRef<number>(0);

  // 1. Initial Load
  // Small dataset: gunakan cache + full sync seperti sebelumnya.
  // Large dataset: jangan pernah hydrate 100k+ rows ke browser; gunakan bootstrap ringan.
  useEffect(() => {
    let isMounted = true;

    const totalFromCounts = (counts?: Record<string, number>) =>
      Object.values(counts || {}).reduce((sum, value) => sum + Number(value || 0), 0);

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    async function loadCachedDatabase() {
      try {
        const [
          cachedOwners,
          cachedPets,
          cachedQueues,
          cachedSoap,
          cachedCages,
          cachedInventory,
          cachedBookings,
          cachedStaff,
          cachedFeedbacks,
        ] = await Promise.all([
          getIdbItem<Owner[]>(STORAGE_KEYS.OWNERS),
          getIdbItem<Pet[]>(STORAGE_KEYS.PETS),
          getIdbItem<VisitQueue[]>(STORAGE_KEYS.QUEUES),
          getIdbItem<SoapRecord[]>(STORAGE_KEYS.SOAP),
          getIdbItem<InpatientCage[]>(STORAGE_KEYS.CAGES),
          getIdbItem<InventoryItem[]>(STORAGE_KEYS.INVENTORY),
          getIdbItem<BookingAppointment[]>(STORAGE_KEYS.BOOKINGS),
          getIdbItem<StaffUser[]>(STORAGE_KEYS.STAFF_LIST),
          getIdbItem<CustomerFeedback[]>(STORAGE_KEYS.FEEDBACKS),
        ]);

        if (!isMounted) return;

        if (cachedOwners?.length) setOwners(cachedOwners);
        if (cachedPets?.length) setPets(cachedPets);
        if (cachedQueues?.length) setQueues(cachedQueues);
        if (cachedSoap?.length) setSoapRecords(cachedSoap);
        if (cachedCages?.length) setCages(cachedCages);
        if (cachedInventory?.length) setInventory(cachedInventory);
        if (cachedBookings?.length) setBookings(cachedBookings);
        if (cachedStaff?.length) setStaffList(cachedStaff);
        if (cachedFeedbacks?.length) setFeedbacks(cachedFeedbacks);
      } catch (err) {
        console.warn('Gagal membaca cache IndexedDB lokal:', err);
      }
    }

    async function loadLargeBootstrap(status?: any) {
      const bootstrap = await fetchBootstrapFromBackend({ perTable: 100 });
      if (bootstrap.success && bootstrap.data && isMounted) {
        setIsLargeDataMode(true);
        hasInitialSyncedRef.current = true;
        importDatabase(bootstrap.data);
        if (bootstrap.status?.version) {
          localBackendVersionRef.current = bootstrap.status.version;
        }
        setSyncStatus('connected');
        return true;
      }
      return false;
    }

    async function loadFromStaticSpreadsheet() {
      // Do not gate this by local connection/cache state. The Apps Script URL is
      // the authoritative READ source on static hosting.
      if (!spreadsheetConfig.webAppUrl) return false;

      try {
        const ping = await testSpreadsheetConnection(spreadsheetConfig.webAppUrl);
        const total = totalFromCounts(ping.counts);
        if (total >= LARGE_DATA_THRESHOLD) {
          setIsLargeDataMode(true);

          // Stage 7.2: one Apps Script request for the startup working set.
          // SOAP remains query-first and is intentionally excluded from startup hydration.
          const criticalTables: Array<keyof SpreadsheetDatabaseSchema> = [
            'owners', 'pets', 'queues', 'cages', 'bookings', 'staff', 'inventory', 'feedbacks'
          ];
          const batch = await pullTablesBatchFromSpreadsheet(
            spreadsheetConfig.webAppUrl,
            criticalTables,
            100
          );

          if (batch.success && batch.data) {
            hasInitialSyncedRef.current = true;
            importDatabase(batch.data);
            setSyncStatus('connected');
            return true;
          }

          // Compatibility fallback while the Apps Script deployment is still on Stage 6.2.
          // This keeps the existing production behavior intact until fetchTables is deployed.
          const pages = await Promise.all(
            criticalTables.map((table) =>
              import('../database/spreadsheetDb').then(({ pullTableFromSpreadsheet }) =>
                pullTableFromSpreadsheet(spreadsheetConfig.webAppUrl, table, 0, 100)
              )
            )
          );
          const data: Partial<SpreadsheetDatabaseSchema> = {};
          criticalTables.forEach((table, index) => {
            const result: any = pages[index];
            if (result?.success) (data as any)[table] = result.data || [];
          });
          hasInitialSyncedRef.current = true;
          importDatabase(data);
          setSyncStatus('connected');
          return true;
        }

        const full = await pullFullDatabaseFromSpreadsheet(spreadsheetConfig.webAppUrl);
        if (full.success && full.data) {
          hasInitialSyncedRef.current = true;
          importDatabase(full.data);
          setSyncStatus('connected');
          return true;
        }
      } catch (err) {
        console.warn('Initial direct Spreadsheet gagal:', err);
      }
      return false;
    }

    async function loadInitial() {
      // PRODUCTION STATIC HOST: read Google Sheets first and directly.
      // Local IndexedDB/cache must never win over the latest Spreadsheet data.
      if (isStaticHost) {
        const loadedFromSpreadsheet = await loadFromStaticSpreadsheet();
        if (loadedFromSpreadsheet) return;
      }

      // Prioritaskan status remote sebelum membaca cache besar.
      try {
        let status = await fetchStatusFromBackend();

        // Backend baru mulai sinkronisasi: beri waktu cache server terisi.
        if (status?.isSyncing && totalFromCounts(status.counts) === 0) {
          await triggerBackendSync();
          for (let i = 0; i < 20 && isMounted; i++) {
            await sleep(500);
            status = await fetchStatusFromBackend();
            if (status && (!status.isSyncing || totalFromCounts(status.counts) > 0)) break;
          }
        }

        const total = totalFromCounts(status?.counts);
        if (status && (total >= LARGE_DATA_THRESHOLD || status.isSyncing)) {
          const loaded = await loadLargeBootstrap(status);
          if (loaded) {
            const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
            setLastSyncMessage(`Mode data besar aktif — browser memuat working set ringan (${time} WIB)`);
            return;
          }
        }

        // Dataset kecil tetap memakai mekanisme cache lokal penuh.
        await loadCachedDatabase();

        const backendRes = await fetchDatabaseFromBackend();
        if (isMounted && backendRes.success && backendRes.data) {
          hasInitialSyncedRef.current = true;
          importDatabase(backendRes.data);
          if (backendRes.status?.version) localBackendVersionRef.current = backendRes.status.version;
          setSyncStatus('connected');
          const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
          setLastSyncMessage(`Sinkronisasi otomatis backend aktif (${time} WIB)`);
          return;
        }
      } catch (err) {
        console.warn('Initial fetch backend gagal:', err);
      }

      // GitHub Pages / static hosting.
      await loadFromStaticSpreadsheet();
    }

    loadInitial();
    return () => {
      isMounted = false;
    };
  }, []);

  // ==========================================
  // AUTO-SYNC POLLING VIA BACKEND & FALLBACK
  // ==========================================
  const pollCountsRef = useRef<Record<string, number> | null>(null);
  const syncStatusRef = useRef(syncStatus);
  useEffect(() => { syncStatusRef.current = syncStatus; }, [syncStatus]);

  // Flag untuk mencegah loop balik saat data ditarik dari Google Spreadsheet
  const isRemoteSyncRef = useRef<boolean>(false);
  const hasInitialSyncedRef = useRef<boolean>(false);

  const stateRefs = useRef({
    owners,
    pets,
    queues,
    inventory,
    cages,
    inpatientHistory,
    soapRecords,
    bookings,
    feedbacks,
    staffList,
  });
  stateRefs.current = {
    owners,
    pets,
    queues,
    inventory,
    cages,
    inpatientHistory,
    soapRecords,
    bookings,
    feedbacks,
    staffList,
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const poll = async () => {
      if (document.visibilityState !== 'visible') return;

      try {
        const status = await fetchStatusFromBackend();
        if (status) {
          // Server backend aktif
          if (status.isSyncing) {
            setSyncStatus('syncing');
            setLastSyncMessage('Backend sedang melakukan sinkronisasi otomatis dengan Google Sheets...');
          } else if (status.isConnected) {
            setSyncStatus('connected');
          }

          if (status.version > localBackendVersionRef.current) {
            localBackendVersionRef.current = status.version;
            if (isLargeDataMode) {
              const bootstrap = await fetchBootstrapFromBackend({ perTable: 100 });
              if (bootstrap.success && bootstrap.data) {
                importDatabase(bootstrap.data);
                const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
                setLastSyncMessage(`Sinkronisasi data besar aktif (${time} WIB)`);
              }
            } else {
              const backendData = await fetchDatabaseFromBackend();
              if (backendData.success && backendData.data) {
                importDatabase(backendData.data);
                const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
                setLastSyncMessage(`Sinkronisasi otomatis aktif (${time} WIB)`);
              }
            }
          }
          return;
        }
      } catch {
        // Abaikan
      }

      // Fallback polling untuk GitHub Pages (Direct Google Apps Script Ping)
      if (spreadsheetConfig.isConnected && spreadsheetConfig.autoSync && spreadsheetConfig.webAppUrl) {
        if (syncStatusRef.current === 'syncing') return;
        try {
          const ping = await testSpreadsheetConnection(spreadsheetConfig.webAppUrl);
          if (ping.success && ping.counts) {
            const prevCounts = pollCountsRef.current;
            const rowCountChanged =
              !prevCounts || Object.keys(ping.counts).some((k) => ping.counts![k] !== prevCounts[k]);
            pollCountsRef.current = ping.counts;

            if (rowCountChanged) {
              await syncFromSpreadsheet(true);
            }
          }
        } catch {
          // Abaikan
        }
      }
    };

    // Polling berkala (5s jika ada backend, atau 30s jika static)
    const intervalId = setInterval(poll, 10000);
    return () => clearInterval(intervalId);
  }, [spreadsheetConfig.isConnected, spreadsheetConfig.autoSync, spreadsheetConfig.webAppUrl, isLargeDataMode]);

  // Sync with IndexedDB & session storage
  useEffect(() => { saveStored(STORAGE_KEYS.OWNERS, owners); }, [owners]);
  useEffect(() => { saveStored(STORAGE_KEYS.PETS, pets); }, [pets]);
  useEffect(() => { saveStored(STORAGE_KEYS.QUEUES, queues); }, [queues]);
  useEffect(() => { saveStored(STORAGE_KEYS.INVENTORY, inventory); }, [inventory]);
  useEffect(() => { saveStored(STORAGE_KEYS.CAGES, cages); }, [cages]);
  useEffect(() => { saveStored(STORAGE_KEYS.INPATIENT_HISTORY, inpatientHistory); }, [inpatientHistory]);
  useEffect(() => { saveStored(STORAGE_KEYS.SOAP, soapRecords); }, [soapRecords]);
  useEffect(() => { saveStored(STORAGE_KEYS.BOOKINGS, bookings); }, [bookings]);
  useEffect(() => { saveStored(STORAGE_KEYS.FEEDBACKS, feedbacks); }, [feedbacks]);
  useEffect(() => { saveStored(STORAGE_KEYS.STAFF_LIST, staffList); }, [staffList]);
  useEffect(() => { saveStored(STORAGE_KEYS.STAFF_USER, currentUser); }, [currentUser]);
  useEffect(() => { saveStored(STORAGE_KEYS.SERVING_TICKET, currentServingTicket); }, [currentServingTicket]);
  useEffect(() => { saveStored(STORAGE_KEYS.ACTIVE_PATIENT, activePatientTicket); }, [activePatientTicket]);
  useEffect(() => { saveStored(STORAGE_KEYS.SPREADSHEET_CONFIG, spreadsheetConfig); }, [spreadsheetConfig]);

  // Otomatis sinkronkan nomor tiket "Sedang Dilayani" berdasarkan status antrean yang aktif di Poli
  useEffect(() => {
    const activePoliQueue = queues.find((q) => q.status === 'Di Ruang Poli' && isToday(q.createdAt));
    setCurrentServingTicket(activePoliQueue ? activePoliQueue.ticketNumber : '-');
  }, [queues]);

  // Bersihkan activePatientTicket jika tiket tersebut sudah tidak ada di antrean
  useEffect(() => {
    if (activePatientTicket && !queues.some((q) => q.ticketNumber === activePatientTicket)) {
      setActivePatientTicket(null);
    }
  }, [queues, activePatientTicket]);

  // Background Auto-Sync ke Google Spreadsheet per-tabel untuk data operasional kecil
  const markSynced = (nowStr: string) =>
    setSpreadsheetConfig((prev) => ({ ...prev, lastSyncedAt: nowStr }));

  useAutoSyncTable('queues', queues, spreadsheetConfig, setSyncStatus, setLastSyncMessage, markSynced, isRemoteSyncRef, hasInitialSyncedRef);
  useAutoSyncTable('inventory', inventory, spreadsheetConfig, setSyncStatus, setLastSyncMessage, markSynced, isRemoteSyncRef, hasInitialSyncedRef);
  useAutoSyncTable('cages', cages, spreadsheetConfig, setSyncStatus, setLastSyncMessage, markSynced, isRemoteSyncRef, hasInitialSyncedRef);
  useAutoSyncTable('bookings', bookings, spreadsheetConfig, setSyncStatus, setLastSyncMessage, markSynced, isRemoteSyncRef, hasInitialSyncedRef);
  useAutoSyncTable('feedbacks', feedbacks, spreadsheetConfig, setSyncStatus, setLastSyncMessage, markSynced, isRemoteSyncRef, hasInitialSyncedRef);
  useAutoSyncTable('staff', staffList, spreadsheetConfig, setSyncStatus, setLastSyncMessage, markSynced, isRemoteSyncRef, hasInitialSyncedRef);

  // ==========================================
  // SPREADSHEET ACTIONS
  // ==========================================

  const connectSpreadsheet = async (url: string): Promise<{ success: boolean; message: string }> => {
    setSyncStatus('syncing');
    setLastSyncMessage('Menguji koneksi ke Google Spreadsheet...');

    const testRes = await testSpreadsheetConnection(url);
    if (!testRes.success) {
      setSyncStatus('error');
      setLastSyncMessage(testRes.message);
      return testRes;
    }

    // Try pulling initial data if available
    const pullRes = await pullFullDatabaseFromSpreadsheet(url);
    if (pullRes.success && pullRes.data) {
      importDatabase(pullRes.data);
    } else {
      // If the spreadsheet is brand new, push current local data to initialize it
      const currentSchema: SpreadsheetDatabaseSchema = {
        owners,
        pets,
        queues,
        soapRecords,
        cages,
        inventory,
        bookings,
        staff: staffList,
        feedbacks,
      };
      await pushFullDatabaseToSpreadsheet(url, currentSchema);
    }

    const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    const newConfig: SpreadsheetConfig = {
      ...spreadsheetConfig,
      webAppUrl: url.trim(),
      isConnected: true,
      lastSyncedAt: nowStr,
    };

    setSpreadsheetConfig(newConfig);
    setSyncStatus('connected');
    const msg = 'Berhasil terhubung ke Google Spreadsheet Database!';
    setLastSyncMessage(msg);
    return { success: true, message: msg };
  };

  const disconnectSpreadsheet = () => {
    setSpreadsheetConfig((prev) => ({
      ...prev,
      isConnected: false,
    }));
    setSyncStatus('idle');
    setLastSyncMessage('Spreadsheet diputuskan. Menggunakan penyimpanan lokal.');
  };

  const updateSpreadsheetConfig = (partial: Partial<SpreadsheetConfig>) => {
    setSpreadsheetConfig((prev) => ({ ...prev, ...partial }));
  };

  const syncToSpreadsheet = async (customDb?: SpreadsheetDatabaseSchema): Promise<{ success: boolean; message: string }> => {
    if (!spreadsheetConfig.webAppUrl) {
      return { success: false, message: 'URL Google Apps Script belum diatur.' };
    }

    const targetDb = customDb || {
      owners,
      pets,
      queues,
      soapRecords,
      cages,
      inventory,
      bookings,
      staff: staffList,
      feedbacks,
    };

    // Safeguard: Cegah sinkronisasi jika data lokal kosong agar tidak menimpa sheet dengan kosong
    if ((targetDb.owners || []).length === 0 && (targetDb.pets || []).length === 0) {
      setSyncStatus('connected');
      const errorMsg = 'Gagal sinkron: Database lokal kosong. Tarik data terlebih dahulu dari Spreadsheet untuk mencegah terhapusnya data!';
      setLastSyncMessage(errorMsg);
      return { success: false, message: errorMsg };
    }

    setSyncStatus('syncing');
    setLastSyncMessage('Mengirim seluruh data ke Google Spreadsheet...');

    const res = await pushFullDatabaseToSpreadsheet(spreadsheetConfig.webAppUrl, targetDb);
    if (res.success) {
      const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
      setSpreadsheetConfig((prev) => ({ ...prev, isConnected: true, lastSyncedAt: nowStr }));
      setSyncStatus('connected');
      setLastSyncMessage(`Sinkronisasi berhasil pada ${nowStr} WIB`);
    } else {
      setSyncStatus('error');
      setLastSyncMessage(res.message);
    }
    return res;
  };

  const syncFromSpreadsheet = async (silent: boolean = false): Promise<{ success: boolean; message: string }> => {
    if (!silent) {
      setSyncStatus('syncing');
      setLastSyncMessage('Membaca data terbaru langsung dari Google Sheets...');
    }

    // On GitHub Pages, bypass Express/backend/cache completely for READs.
    // Google Sheets is the production source of truth.
    if (isStaticHost && spreadsheetConfig.webAppUrl) {
      try {
        const directRes = await pullFullDatabaseFromSpreadsheet(spreadsheetConfig.webAppUrl);
        if (directRes.success && directRes.data) {
          hasInitialSyncedRef.current = true;
          importDatabase(directRes.data);
          const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
          setSpreadsheetConfig((prev) => ({ ...prev, isConnected: true, lastSyncedAt: nowStr }));
          setSyncStatus('connected');
          const msg = 'Data terbaru berhasil dibaca langsung dari Google Sheets pada ' + nowStr + ' WIB';
          if (!silent) setLastSyncMessage(msg);
          return { success: true, message: msg };
        }
      } catch (err) {
        console.warn('Pembacaan langsung Google Sheets gagal:', err);
      }
    }

    // Development/non-static fallback: backend sync remains available.
    // 1. Picu proses sinkronisasi background di server
    triggerBackendSync().catch(() => {});

    // 2. Ambil data langsung dari server backend (super cepat, ~10ms)
    try {
      const res = await fetchDatabaseFromBackend();
      if (res.success && res.data) {
        hasInitialSyncedRef.current = true;
        importDatabase(res.data);
        if (res.status?.version) {
          localBackendVersionRef.current = res.status.version;
        }
        const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
        setSpreadsheetConfig((prev) => ({ ...prev, isConnected: true, lastSyncedAt: nowStr }));
        setSyncStatus('connected');
        const msg = `Sinkronisasi otomatis aktif (${nowStr} WIB)`;
        if (!silent) setLastSyncMessage(msg);
        return { success: true, message: msg };
      }
    } catch {
      // Abaikan dan gunakan fallback direct jika backend tidak merespons
    }

    // Fallback: jika backend belum siap, tarik langsung via browser.
    // Pada dataset besar gunakan fetchTable per halaman, bukan fetchAll.
    if (spreadsheetConfig.webAppUrl) {
      if (isLargeDataMode) {
        const tables: Array<keyof SpreadsheetDatabaseSchema> = [
          'owners', 'pets', 'queues', 'soapRecords', 'cages',
          'inventory', 'bookings', 'staff', 'feedbacks'
        ];
        const pages = await Promise.all(
          tables.map((table) =>
            import('../database/spreadsheetDb').then(({ pullTableFromSpreadsheet }) =>
              pullTableFromSpreadsheet(spreadsheetConfig.webAppUrl, table, 0, 100)
            )
          )
        );
        const data: Partial<SpreadsheetDatabaseSchema> = {};
        tables.forEach((table, index) => {
          const result: any = pages[index];
          if (result?.success) (data as any)[table] = result.data || [];
        });
        hasInitialSyncedRef.current = true;
        importDatabase(data);
        const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
        setSpreadsheetConfig((prev) => ({ ...prev, isConnected: true, lastSyncedAt: nowStr }));
        setSyncStatus('connected');
        const msg = `Mode data besar aktif — working set diperbarui pada ${nowStr} WIB`;
        if (!silent) setLastSyncMessage(msg);
        return { success: true, message: msg };
      }

      const directRes = await pullFullDatabaseFromSpreadsheet(spreadsheetConfig.webAppUrl);
      if (directRes.success && directRes.data) {
        hasInitialSyncedRef.current = true;
        importDatabase(directRes.data);
        const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
        setSpreadsheetConfig((prev) => ({ ...prev, isConnected: true, lastSyncedAt: nowStr }));
        setSyncStatus('connected');
        const msg = `Data berhasil ditarik dari Spreadsheet pada ${nowStr} WIB`;
        if (!silent) setLastSyncMessage(msg);
        return { success: true, message: msg };
      }
    }

    if (!silent) {
      setSyncStatus('error');
      setLastSyncMessage('Gagal menyinkronkan data.');
    }
    return { success: false, message: 'Gagal menyinkronkan data.' };
  };

  const importDatabase = (data: Partial<SpreadsheetDatabaseSchema>) => {
    // Fast comparison without JSON.stringify on 100k items to avoid locking up main thread
    const applyIfChanged = <T extends Record<string, any>>(incoming: T[] | undefined, current: T[], setter: (v: T[]) => void) => {
      if (incoming === undefined || !Array.isArray(incoming)) return;
      let hasChanged = incoming.length !== current.length;
      if (!hasChanged && incoming.length > 0 && current.length > 0) {
        const firstIn = incoming[0];
        const firstCur = current[0];
        const lastIn = incoming[incoming.length - 1];
        const lastCur = current[current.length - 1];
        if (firstIn?.id !== firstCur?.id || lastIn?.id !== lastCur?.id) {
          hasChanged = true;
        }
      }
      // Every remote import is authoritative. Even when length/first/last IDs
      // are unchanged, a row in the middle may have been edited in Sheets.
      // Never let stale IndexedDB/state survive a successful Spreadsheet READ.
      if (hasChanged || current.length === 0 || incoming.length === current.length) {
        isRemoteSyncRef.current = true;
        setter(incoming);
        setTimeout(() => {
          isRemoteSyncRef.current = false;
        }, 1500);
      }
    };

    const completedHistoriesToAppend: InpatientHistoryRecord[] = [];

    // 1. Bersihkan & petakan data Pemilik
    let cleanOwners: Owner[] = [];
    if (data.owners !== undefined && Array.isArray(data.owners)) {
      cleanOwners = data.owners.map(sanitizeOwner).filter((x): x is Owner => x !== null);
    } else {
      cleanOwners = [...stateRefs.current.owners];
    }

    const ownerLookupMap = new Map<string, Owner>();
    cleanOwners.forEach((o) => {
      if (o.id) ownerLookupMap.set(o.id, o);
      if (o.whatsapp) {
        ownerLookupMap.set(normalizePhoneWithZero(o.whatsapp), o);
        const cleanDigits = String(o.whatsapp).replace(/\D/g, '');
        if (cleanDigits) ownerLookupMap.set(cleanDigits, o);
      }
    });

    // 2. Bersihkan & petakan data Pasien (dengan deteksi & pemulihan kolom yang bergeser)
    if (data.pets !== undefined && Array.isArray(data.pets)) {
      const cleanPets = data.pets
        .map((p) => sanitizePet(p, ownerLookupMap))
        .filter((x): x is Pet => x !== null);

      // Pastikan jika ada pemilik di pet yang belum ada di cleanOwners, otomatis ditambahkan
      cleanPets.forEach((p) => {
        if (p.ownerWhatsapp) {
          const normWa = normalizePhoneWithZero(p.ownerWhatsapp);
          const cleanDigits = normWa.replace(/\D/g, '');
          const existing =
            (p.ownerId && ownerLookupMap.get(p.ownerId)) ||
            ownerLookupMap.get(normWa) ||
            ownerLookupMap.get(cleanDigits);

          if (!existing && (p.ownerName || p.ownerWhatsapp)) {
            const newOwn: Owner = {
              id: p.ownerId || stableIdFrom('own', [p.ownerName, normWa]),
              name: p.ownerName || 'Pemilik',
              whatsapp: normWa,
              address: '',
              registeredAt: p.registeredAt || new Date().toISOString(),
              notes: 'Persetujuan Tindakan Medis & Pemeriksaan Klinik Terstandar disetujui oleh pemilik.',
              informedConsent: 'Persetujuan Tindakan Medis & Pemeriksaan Klinik Terstandar disetujui oleh pemilik.',
            };
            cleanOwners.push(newOwn);
            ownerLookupMap.set(newOwn.id, newOwn);
            ownerLookupMap.set(normWa, newOwn);
            if (cleanDigits) ownerLookupMap.set(cleanDigits, newOwn);
          }
        }
      });

      applyIfChanged(cleanPets, stateRefs.current.pets, setPets);
    }

    applyIfChanged(cleanOwners, stateRefs.current.owners, setOwners);
    if (data.queues !== undefined && Array.isArray(data.queues)) {
      const cleanQueues = data.queues.map(sanitizeQueue).filter((x): x is VisitQueue => x !== null);
      applyIfChanged(cleanQueues, stateRefs.current.queues, setQueues);
    }
    if (data.inventory !== undefined && Array.isArray(data.inventory)) {
      const cleanInv = data.inventory.filter((i) => i && (i.id || i.name));
      applyIfChanged(cleanInv, stateRefs.current.inventory, setInventory);
    }
    if (data.cages !== undefined && Array.isArray(data.cages)) {
      const activeCagesMap = new Map<string, InpatientCage>();
      // Inisialisasi strictly HANYA 12 kandang fisik standar klinik (A1 - B6)
      INITIAL_CAGES.forEach((ic) => activeCagesMap.set(ic.id, { ...ic }));

      data.cages.forEach((c) => {
        if (!c) return;

        let obs: any = c.observations;
        if (typeof obs === 'string' && obs.trim()) {
          try {
            obs = JSON.parse(obs);
          } catch {
            obs = [];
          }
        }
        const cleanObs = Array.isArray(obs) ? obs : [];

        const normalizedId = normalizeCageId(c.id, c.label);
        const statusLower = String(c.status || '').toLowerCase();
        // cag-..., status selesai, atau ID non-fisik adalah data riwayat rawat inap
        const isHistorical = !normalizedId || String(c.id || '').startsWith('cag-') || statusLower === 'selesai';

        if (isHistorical) {
          // Cari ID pasien berdasarkan c.petId atau nama pasien
          let targetPetId = c.petId;
          let targetPetName = c.petName || 'Pasien';
          let targetPetType = c.petType || 'Cat';
          let targetOwnerName = c.ownerName || 'Pemilik';
          let targetOwnerWhatsapp = c.ownerWhatsapp ? normalizePhoneWithZero(c.ownerWhatsapp) : '-';

          if (!targetPetId && c.petName) {
            const cleanPetName = String(c.petName).toLowerCase().trim();
            const matchedPet = (stateRefs.current.pets || []).find((p) => {
              const nameMatches = p.name.toLowerCase().trim() === cleanPetName;
              if (!nameMatches) return false;
              if (c.ownerWhatsapp && p.ownerWhatsapp) {
                return normalizePhoneWithZero(p.ownerWhatsapp) === normalizePhoneWithZero(c.ownerWhatsapp);
              }
              return true;
            });
            if (matchedPet) {
              targetPetId = matchedPet.id;
              targetPetName = matchedPet.name;
              targetPetType = matchedPet.type;
              targetOwnerName = matchedPet.ownerName || targetOwnerName;
              targetOwnerWhatsapp = matchedPet.ownerWhatsapp || targetOwnerWhatsapp;
            } else {
              targetPetId = stableIdFrom('pet', [targetPetName, targetOwnerName, targetOwnerWhatsapp]);
            }
          }

          if (targetPetId || c.petName) {
            const now = new Date();
            const dischargeTimeFormatted = `${now.toISOString().split('T')[0]} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            const admittedTime = c.admittedAt || dischargeTimeFormatted;
            
            const existingHist = stateRefs.current.inpatientHistory || [];
            const isDup = existingHist.some(
              (eh) =>
                (targetPetId && eh.petId === targetPetId && eh.admittedAt === admittedTime) ||
                (eh.petName.toLowerCase().trim() === targetPetName.toLowerCase().trim() && eh.admittedAt === admittedTime)
            );

            if (!isDup) {
              const histId = `hist-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
              completedHistoriesToAppend.push({
                id: histId,
                cageId: '',
                cageLabel: '',
                petId: targetPetId || '',
                petName: targetPetName,
                petType: targetPetType,
                ownerName: targetOwnerName,
                ownerWhatsapp: targetOwnerWhatsapp,
                diagnosis: c.diagnosis || 'Perawatan Rawat Inap',
                admittedAt: admittedTime,
                dischargedAt: dischargeTimeFormatted,
                veterinarian: c.veterinarian || 'drh. Sarah Wijaya',
                observations: cleanObs,
              });
            }
          }

          // Jika record riwayat memiliki ID kandang fisik (A1-B6), pastikan unit fisik tersebut kosong (Available) di layout
          if (normalizedId && activeCagesMap.has(normalizedId)) {
            const defaultCage = activeCagesMap.get(normalizedId)!;
            activeCagesMap.set(normalizedId, {
              ...defaultCage,
              status: 'Available',
              petId: undefined,
              petName: undefined,
              petType: undefined,
              ownerName: undefined,
              ownerWhatsapp: undefined,
              diagnosis: undefined,
              admittedAt: undefined,
              veterinarian: undefined,
              observations: [],
            });
          }
          // PENTING: Data cag-... TIDAK BOLEH dimasukkan ke layout activeCagesMap!
        } else if (normalizedId && activeCagesMap.has(normalizedId)) {
          // Unit kandang fisik A1 - B6 yang sedang terisi atau dibersihkan
          const defaultCage = activeCagesMap.get(normalizedId)!;
          activeCagesMap.set(normalizedId, {
            ...defaultCage,
            ...c,
            id: normalizedId, // ID kandang selalu mengikuti nama kandang fisik (A1..B6)
            label: defaultCage.label,
            status: c.status === 'Cleaning' ? 'Cleaning' : 'Occupied',
            observations: cleanObs,
          });
        }
      });

      if (completedHistoriesToAppend.length > 0) {
        setInpatientHistory((prev) => {
          const merged = [...prev];
          completedHistoriesToAppend.forEach((newH) => {
            if (!merged.some((eh) => (newH.petId && eh.petId === newH.petId && eh.admittedAt === newH.admittedAt) || (eh.petName.toLowerCase() === newH.petName.toLowerCase() && eh.admittedAt === newH.admittedAt))) {
              merged.unshift(newH);
            }
          });
          return merged;
        });
      }

      // Pastikan urutan dan jumlah kandang selalu tepat 12 unit fisik (A1-A6 & B1-B6)
      const finalCages = INITIAL_CAGES.map((ic) => activeCagesMap.get(ic.id) || ic);
      applyIfChanged(finalCages, stateRefs.current.cages, setCages);
    }
    if (data.soapRecords !== undefined && Array.isArray(data.soapRecords)) {
      const cleanSoap = data.soapRecords.map(sanitizeSoapRecord).filter((x): x is SoapRecord => x !== null);

      // Pastikan rekam medis pelepasan rawat inap dari status Selesai otomatis ditambahkan ke rekam medis
      completedHistoriesToAppend.forEach((h) => {
        const alreadyHasSoap = cleanSoap.some(
          (s) =>
            (h.petId && s.petId === h.petId && s.soap?.subjective?.includes(h.admittedAt)) ||
            (s.petName?.toLowerCase().trim() === h.petName.toLowerCase().trim() && s.soap?.subjective?.includes(h.admittedAt))
        );
        if (!alreadyHasSoap) {
          const nextSoapId = `soap-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          cleanSoap.unshift({
            id: nextSoapId,
            petId: h.petId,
            petName: h.petName,
            ownerName: h.ownerName,
            ownerWhatsapp: h.ownerWhatsapp,
            veterinarian: h.veterinarian,
            date: h.dischargedAt,
            vitals: {
              weight: 0,
              temperature: h.observations?.[0]?.temp || 38.5,
              heartRate: 0,
              respiratoryRate: 0,
            },
            soap: {
              subjective: `Rawat Inap Selesai.\nMasuk: ${h.admittedAt}\nKeluar: ${h.dischargedAt}`,
              objective: `Pasien dipulangkan dalam kondisi stabil. Log observasi rawat inap memiliki ${h.observations?.length || 0} entri.`,
              assessment: `Selesai Rawat Inap - Diagnosis: ${h.diagnosis}`,
              plan: `Edukasi owner mengenai pemeliharaan mandiri, pemulihan pasca tindakan medis, dan terapi rawat jalan di rumah.`,
            },
            prescriptions: [],
            serviceFee: 0,
          });
        }
      });

      applyIfChanged(cleanSoap, stateRefs.current.soapRecords, setSoapRecords);
    } else if (completedHistoriesToAppend.length > 0) {
      // Jika soapRecords tidak disertakan dalam sync saat ini, perbarui soapRecords secara lokal
      setSoapRecords((prev) => {
        const merged = [...prev];
        completedHistoriesToAppend.forEach((h) => {
          const alreadyHasSoap = merged.some(
            (s) =>
              (h.petId && s.petId === h.petId && s.soap?.subjective?.includes(h.admittedAt)) ||
              (s.petName?.toLowerCase().trim() === h.petName.toLowerCase().trim() && s.soap?.subjective?.includes(h.admittedAt))
          );
          if (!alreadyHasSoap) {
            const nextSoapId = `soap-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            merged.unshift({
              id: nextSoapId,
              petId: h.petId,
              petName: h.petName,
              ownerName: h.ownerName,
              ownerWhatsapp: h.ownerWhatsapp,
              veterinarian: h.veterinarian,
              date: h.dischargedAt,
              vitals: {
                weight: 0,
                temperature: h.observations?.[0]?.temp || 38.5,
                heartRate: 0,
                respiratoryRate: 0,
              },
              soap: {
                subjective: `Rawat Inap Selesai.\nMasuk: ${h.admittedAt}\nKeluar: ${h.dischargedAt}`,
                objective: `Pasien dipulangkan dalam kondisi stabil. Log observasi rawat inap memiliki ${h.observations?.length || 0} entri.`,
                assessment: `Selesai Rawat Inap - Diagnosis: ${h.diagnosis}`,
                plan: `Edukasi owner mengenai pemeliharaan mandiri, pemulihan pasca tindakan medis, dan terapi rawat jalan di rumah.`,
              },
              prescriptions: [],
              serviceFee: 0,
            });
          }
        });
        return merged;
      });
    }
    if (data.bookings !== undefined && Array.isArray(data.bookings)) {
      const cleanBookings = data.bookings.filter((b) => b && (b.id || b.petName || b.ownerName));
      applyIfChanged(cleanBookings, stateRefs.current.bookings, setBookings);
    }
    if (data.feedbacks !== undefined && Array.isArray(data.feedbacks)) {
      const cleanFeedbacks = data.feedbacks.filter((f) => f && (f.id || f.ticketNumber || f.feedbackText));
      applyIfChanged(cleanFeedbacks, stateRefs.current.feedbacks, setFeedbacks);
    }
    if (data.staff !== undefined && Array.isArray(data.staff) && data.staff.length > 0) {
      const normalizedStaff: StaffUser[] = data.staff
        .map((s, idx) => {
          const username = String(s.username || '').trim().toLowerCase();
          let role: StaffRole = 'Staff Admin / Frontdesk';
          if (
            String(s.role || '').toLowerCase().includes('super') ||
            String(s.role || '').toLowerCase().includes('owner') ||
            String(s.role || '').toLowerCase().includes('direktur') ||
            username === 'owner' ||
            username === 'superadmin'
          ) {
            role = 'Super Admin / Owner';
          } else if (s.role === 'Dokter Hewan' || username.includes('.vet')) {
            role = 'Dokter Hewan';
          }
          const pass =
            s.password !== undefined && s.password !== null && String(s.password).trim() !== ''
              ? String(s.password).trim()
              : 'admin';
          return {
            id: s.id && String(s.id).trim() ? String(s.id).trim() : `staff-${username || idx + 1}`,
            username,
            name: String(s.name || s.username || 'Staf Admin').trim(),
            role,
            password: pass,
            avatar: s.avatar && String(s.avatar).trim() ? String(s.avatar).trim() : (role === 'Super Admin / Owner' ? '👑' : role === 'Dokter Hewan' ? '👩‍⚕️' : '👨‍💼'),
          };
        })
        .filter((s) => s.username.length > 0);

      if (normalizedStaff.length > 0) {
        applyIfChanged(normalizedStaff, stateRefs.current.staffList, (incoming) => {
          setStaffList(incoming);
          if (currentUser) {
            const updatedMe = incoming.find(
              (s) => s.id === currentUser.id || s.username.toLowerCase() === currentUser.username.toLowerCase()
            );
            if (updatedMe) {
              setCurrentUser(updatedMe);
            }
          }
        });
      }
    }
  };

  const clearAllData = () => {
    setOwners([]);
    setPets([]);
    setQueues([]);
    setInventory([]);
    setCages(INITIAL_CAGES);
    setSoapRecords([]);
    setBookings([]);
    setFeedbacks([]);
    setStaffList(INITIAL_STAFF);
    setCurrentServingTicket('-');
    setActivePatientTicket(null);
  };

  const resetToInitialData = () => {
    clearAllData();
  };

  const sanitizeAllExistingDates = (): SpreadsheetDatabaseSchema => {
    const cleanOwners = owners.map((o) => ({
      ...o,
      registeredAt: sanitizeIsoToLocalString(o.registeredAt),
    }));
    const cleanPets = pets.map((p) => ({
      ...p,
      registeredAt: sanitizeIsoToLocalString(p.registeredAt),
    }));
    const cleanQueues = queues.map((q) => ({
      ...q,
      createdAt: sanitizeIsoToLocalString(q.createdAt),
    }));
    const cleanSoap = soapRecords.map((s) => ({
      ...s,
      date: sanitizeIsoToLocalString(s.date),
    }));
    const cleanBookings = bookings.map((b) => ({
      ...b,
      date: sanitizeIsoToLocalString(b.date),
    }));
    const cleanFeedbacks = feedbacks.map((f) => ({
      ...f,
      submittedAt: sanitizeIsoToLocalString(f.submittedAt),
    }));

    setOwners(cleanOwners);
    setPets(cleanPets);
    setQueues(cleanQueues);
    setSoapRecords(cleanSoap);
    setBookings(cleanBookings);
    setFeedbacks(cleanFeedbacks);

    return {
      owners: cleanOwners,
      pets: cleanPets,
      queues: cleanQueues,
      soapRecords: cleanSoap,
      cages,
      inventory,
      bookings: cleanBookings,
      staff: staffList,
      feedbacks: cleanFeedbacks,
    };
  };

  // ==========================================
  // PATIENT REGISTRATION & QUEUE
  // ==========================================

  const registerPatient = (data: RegisterData): string => {
    const cleanPhone = normalizePhoneWithZero(data.owner.whatsapp);
    const now = new Date();
    const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WIB`;
    const regTimestamp = getRegistrationTimestamp(now);
    const consentStatement =
      data.informedConsent ||
      'Disetujui: Bebas tuntutan resiko medis sesuai kaidah kedokteran hewan';

    // 1. Owner Linkage
    let owner = owners.find((o) => normalizePhoneWithZero(o.whatsapp) === cleanPhone);
    if (!owner) {
      const nextOwnerId = generateSequentialId('own', owners.map((o) => o.id));
      owner = {
        id: nextOwnerId,
        name: data.owner.name.trim(),
        whatsapp: cleanPhone,
        address: data.owner.address.trim(),
        registeredAt: regTimestamp,
        notes: consentStatement,
        informedConsent: consentStatement,
      };
      setOwners((prev) => [owner!, ...prev]);
    } else {
      owner = {
        ...owner,
        whatsapp: cleanPhone,
        notes: consentStatement,
        informedConsent: consentStatement,
      };
      setOwners((prev) => prev.map((o) => (o.id === owner!.id ? owner! : o)));
    }

    // 2. Pet Linkage
    let pet = pets.find(
      (p) =>
        (p.ownerId === owner!.id || normalizePhoneWithZero(p.ownerWhatsapp) === cleanPhone) &&
        (p.name || '').trim().toLowerCase() === data.pet.name.trim().toLowerCase()
    );

    if (!pet) {
      const nextPetId = generateSequentialId('pet', pets.map((p) => p.id));
      pet = {
        id: nextPetId,
        ownerId: owner.id,
        ownerName: owner.name,
        ownerWhatsapp: cleanPhone,
        name: data.pet.name.trim(),
        type: data.pet.type,
        breed: data.pet.breed.trim() || 'Mix / Domestik',
        ageOrDob: data.pet.ageOrDob.trim() || '1 Tahun',
        sex: data.pet.sex,
        photoUrl: data.pet.photoUrl,
        status: data.visit.serviceType === 'Daftar' ? 'Sehat' : 'Perawatan',
        registeredAt: regTimestamp,
        informedConsent: consentStatement,
      };
      setPets((prev) => [pet!, ...prev]);
    } else {
      pet = {
        ...pet,
        ownerId: owner.id,
        ownerName: owner.name,
        ownerWhatsapp: cleanPhone,
        informedConsent: consentStatement,
        ...(data.pet.photoUrl ? { photoUrl: data.pet.photoUrl } : {}),
      };
      setPets((prev) =>
        prev.map((p) =>
          p.id === pet!.id ? pet! : p
        )
      );
    }

    // 3. Generate Ticket / Queue (hanya bila meminta layanan/pemeriksaan ke klinik)
    const prefix = data.visit.serviceType === 'Daftar' ? 'REG' : 'A';
    const ticketNumber = generateNextTicketNumber(prefix, queues.map((q) => q.ticketNumber));

    let newQueue: VisitQueue | null = null;
    if (data.visit.serviceType !== 'Daftar') {
      const nextQueueId = generateSequentialId('q', queues.map((q) => q.id));
      newQueue = {
        id: nextQueueId,
        ticketNumber,
        ownerWhatsapp: cleanPhone,
        ownerName: owner.name,
        petId: pet.id,
        petName: pet.name,
        petType: pet.type,
        photoUrl: pet.photoUrl,
        serviceType: data.visit.serviceType,
        chiefComplaint: data.visit.chiefComplaint || 'Pemeriksaan rutin / konsultasi dokter',
        status: 'Menunggu',
        createdAt: regTimestamp,
        informedConsent: consentStatement,
      };

      setQueues((prev) => [...prev, newQueue!]);
      setActivePatientTicket(ticketNumber);
    }

    // Direct O(1) single-record sync ke backend (dan background push ke Google Sheets)
    pushRecordToBackend('owners', owner).catch(() => {});
    pushRecordToBackend('pets', pet).catch(() => {});
    if (newQueue) {
      pushRecordToBackend('queues', newQueue).catch(() => {});
    }

    return ticketNumber;
  };

  const callQueue = (queueId: string, room: string = 'Poli 1') => {
    const queue = queues.find((q) => q.id === queueId);
    if (!queue) return;

    const timeString = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')} WIB`;

    let updatedQueue: VisitQueue | null = null;
    setQueues((prev) =>
      prev.map((q) => {
        if (q.id === queueId) {
          updatedQueue = {
            ...q,
            status: 'Di Ruang Poli',
            calledAt: timeString,
            assignedDoctor: currentUser?.name || 'drh. Sarah Wijaya',
          };
          return updatedQueue;
        }
        return q;
      })
    );

    if (updatedQueue) {
      pushRecordToBackend('queues', updatedQueue).catch(() => {});
    }

    setCurrentServingTicket(queue.ticketNumber);

    setCallNotification({
      ticketNumber: queue.ticketNumber,
      petName: queue.petName,
      ownerName: queue.ownerName,
      room,
      timestamp: timeString,
    });
  };

  const completeQueue = (queueId: string) => {
    const timeString = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')} WIB`;

    const target = queues.find((q) => q.id === queueId);
    if (target && currentServingTicket === target.ticketNumber) {
      setCurrentServingTicket('-');
    }
    if (target && callNotification?.ticketNumber === target.ticketNumber) {
      setCallNotification(null);
    }

    let updatedQueue: VisitQueue | null = null;
    setQueues((prev) =>
      prev.map((q) => {
        if (q.id === queueId) {
          updatedQueue = {
            ...q,
            status: 'Selesai',
            completedAt: timeString,
          };
          return updatedQueue;
        }
        return q;
      })
    );

    if (updatedQueue) {
      pushRecordToBackend('queues', updatedQueue).catch(() => {});
    }
  };

  const deleteQueue = (queueId: string) => {
    const target = queues.find((q) => q.id === queueId);
    if (target && currentServingTicket === target.ticketNumber) {
      setCurrentServingTicket('-');
    }
    if (target && callNotification?.ticketNumber === target.ticketNumber) {
      setCallNotification(null);
    }
    setQueues((prev) => prev.filter((q) => q.id !== queueId));
    deleteRecordFromBackend('queues', queueId).catch(() => {});
  };

  const deleteOwner = (ownerId: string) => {
    const targetOwner = owners.find((o) => o.id === ownerId);
    if (!targetOwner) return;
    const cleanPhone = normalizePhoneWithZero(targetOwner.whatsapp);

    // Get all pets belonging to this owner
    const ownerPets = pets.filter(
      (p) => p.ownerId === ownerId || (cleanPhone && normalizePhoneWithZero(p.ownerWhatsapp) === cleanPhone)
    );
    const ownerPetIds = ownerPets.map((p) => p.id);

    // 1. Remove the owner
    setOwners((prev) => prev.filter((o) => o.id !== ownerId));
    deleteRecordFromBackend('owners', ownerId).catch(() => {});

    // 2. Remove all related pets
    setPets((prev) => prev.filter((p) => !ownerPetIds.includes(p.id)));

    // 3. Cascade remove all SOAP records for these pets
    setSoapRecords((prev) => prev.filter((s) => !ownerPetIds.includes(s.petId)));

    // 4. Remove from queues
    setQueues((prev) => prev.filter((q) => !ownerPetIds.includes(q.petId)));

    // 5. Free any occupied inpatient cages
    setCages((prev) =>
      prev.map((cage) => {
        if (cage.petId && ownerPetIds.includes(cage.petId)) {
          return {
            ...cage,
            occupied: false,
            petId: undefined,
            petName: undefined,
            ownerName: undefined,
            breed: undefined,
            diagnosis: undefined,
            checkInDate: undefined,
          };
        }
        return cage;
      })
    );
  };

  const deletePet = (petId: string) => {
    // 1. Remove the pet
    setPets((prev) => prev.filter((p) => p.id !== petId));
    deleteRecordFromBackend('pets', petId).catch(() => {});

    // 2. Cascade remove all SOAP records for this pet
    setSoapRecords((prev) => prev.filter((s) => s.petId !== petId));

    // 3. Remove from queues
    setQueues((prev) => prev.filter((q) => q.petId !== petId));

    // 4. Free occupied inpatient cage if matched
    setCages((prev) =>
      prev.map((cage) => {
        if (cage.petId === petId) {
          return {
            ...cage,
            occupied: false,
            petId: undefined,
            petName: undefined,
            ownerName: undefined,
            breed: undefined,
            diagnosis: undefined,
            checkInDate: undefined,
          };
        }
        return cage;
      })
    );
  };

  const updateOwner = (ownerId: string, updatedData: Partial<Owner>) => {
    let updatedRecord: Owner | null = null;
    setOwners((prev) =>
      prev.map((o) => {
        if (o.id === ownerId) {
          const merged = { ...o, ...updatedData };
          updatedRecord = merged;
          if (updatedData.whatsapp && updatedData.whatsapp !== o.whatsapp) {
            const oldPhone = normalizePhoneWithZero(o.whatsapp);
            const newPhone = normalizePhoneWithZero(updatedData.whatsapp);
            setPets((prevPets) =>
              prevPets.map((p) => {
                if (p.ownerId === ownerId || normalizePhoneWithZero(p.ownerWhatsapp) === oldPhone) {
                  return { ...p, ownerWhatsapp: newPhone, ownerName: merged.name };
                }
                return p;
              })
            );
          } else if (updatedData.name && updatedData.name !== o.name) {
            setPets((prevPets) =>
              prevPets.map((p) => {
                if (p.ownerId === ownerId || normalizePhoneWithZero(p.ownerWhatsapp) === normalizePhoneWithZero(o.whatsapp)) {
                  return { ...p, ownerName: merged.name };
                }
                return p;
              })
            );
          }
          return merged;
        }
        return o;
      })
    );

    if (updatedRecord) {
      pushRecordToBackend('owners', updatedRecord).catch(() => {});
    }
  };

  const updatePet = (petId: string, updatedData: Partial<Pet>) => {
    let updatedRecord: Pet | null = null;
    setPets((prev) =>
      prev.map((p) => {
        if (p.id === petId) {
          const merged = { ...p, ...updatedData };
          updatedRecord = merged;
          return merged;
        }
        return p;
      })
    );

    if (updatedRecord) {
      pushRecordToBackend('pets', updatedRecord).catch(() => {});
    }
  };

  const deleteSoapRecord = (recordId: string) => {
    setSoapRecords((prev) => prev.filter((s) => s.id !== recordId));
    deleteRecordFromBackend('soapRecords', recordId).catch(() => {});
  };

  // ==========================================
  // SOAP MEDICAL RECORD
  // ==========================================

  const saveSoapRecord = (
    record: Omit<SoapRecord, 'id' | 'date'>,
    prescriptionItems: PrescriptionItem[]
  ) => {
    const now = new Date();
    const dateFormatted = getRegistrationTimestamp(now);
    const nextSoapId = generateSequentialId('soap', soapRecords.map((s) => s.id));

    const newRecord: SoapRecord = {
      ...record,
      id: nextSoapId,
      date: dateFormatted,
      prescriptions: prescriptionItems,
    };

    setSoapRecords((prev) => [newRecord, ...prev]);

    // Direct O(1) single-record sync ke backend
    pushRecordToBackend('soapRecords', newRecord).catch(() => {});

    // Potong stok otomatis jika ada resep
    prescriptionItems.forEach((presc) => {
      setInventory((prev) =>
        prev.map((item) =>
          item.id === presc.inventoryItemId
            ? { ...item, stockQuantity: Math.max(0, item.stockQuantity - presc.quantity) }
            : item
        )
      );
    });

    // Tandai queue selesai jika berasal dari antrean
    if (record.queueId) {
      completeQueue(record.queueId);
    }
  };

  // ==========================================
  // INPATIENT CAGES
  // ==========================================

  const updateCageStatus = (cageId: string, status: CageStatus, petId?: string) => {
    const targetId = normalizeCageId(cageId) || cageId;
    setCages((prev) =>
      prev.map((c) => {
        const cNorm = normalizeCageId(c.id, c.label) || c.id;
        if (cNorm !== targetId && c.id !== targetId) return c;
        if (status === 'Available' || status === 'Cleaning') {
          return {
            ...c,
            id: targetId,
            status,
            petId: undefined,
            petName: undefined,
            petType: undefined,
            ownerName: undefined,
            ownerWhatsapp: undefined,
            diagnosis: undefined,
            admittedAt: undefined,
            veterinarian: undefined,
            observations: [],
          };
        }
        return { ...c, id: targetId, status, petId };
      })
    );
  };

  const admitPetToCage = (
    cageId: string,
    pet: Pet,
    owner: Owner,
    diagnosis: string,
    vet: string
  ) => {
    const targetId = normalizeCageId(cageId) || cageId;
    const now = new Date();
    const timeFormatted = `${now.toISOString().split('T')[0]} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    setCages((prev) =>
      prev.map((c) => {
        const cNorm = normalizeCageId(c.id, c.label) || c.id;
        if (cNorm !== targetId && c.id !== targetId) return c;
        return {
          ...c,
          id: targetId, // ID kandang selalu mengikuti nama kandang fisik (A1..B6)
          status: 'Occupied',
          petId: pet.id,
          petName: pet.name,
          petType: pet.type,
          ownerName: owner.name,
          ownerWhatsapp: owner.whatsapp,
          diagnosis,
          admittedAt: timeFormatted,
          veterinarian: vet,
          observations: [
            {
              id: generateSequentialId(
                'obs',
                c.observations?.map((o) => o.id) || []
              ),
              date: now.toISOString().split('T')[0],
              time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
              temp: 38.5,
              appetite: 'Sedang',
              defecationUrination: 'Normal',
              medicationGiven: true,
              cleaned: true,
              notes: 'Pasien baru masuk rawat inap.',
              checkedBy: vet,
            },
          ],
        };
      })
    );

    // Update status pet jadi Rawat Inap
    setPets((prev) =>
      prev.map((p) => (p.id === pet.id ? { ...p, status: 'Rawat Inap' } : p))
    );
  };

  const addCageObservation = (cageId: string, obs: Omit<InpatientObservation, 'id'>) => {
    const targetId = normalizeCageId(cageId) || cageId;
    const currentCage = cages.find((c) => (normalizeCageId(c.id, c.label) || c.id) === targetId);
    const newObs: InpatientObservation = {
      ...obs,
      id: generateSequentialId(
        'obs',
        currentCage?.observations?.map((o) => o.id) || []
      ),
    };

    setCages((prev) =>
      prev.map((c) => {
        const cNorm = normalizeCageId(c.id, c.label) || c.id;
        return (cNorm === targetId || c.id === targetId)
          ? { ...c, observations: [newObs, ...(c.observations || [])] }
          : c;
      })
    );
  };

  const dischargeCage = (cageId: string) => {
    const targetId = normalizeCageId(cageId) || cageId;
    const cage = cages.find((c) => (normalizeCageId(c.id, c.label) || c.id) === targetId);
    if (cage && cage.petId) {
      const now = new Date();
      const dischargeTimeFormatted = `${now.toISOString().split('T')[0]} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const historyRecord: InpatientHistoryRecord = {
        id: generateSequentialId('inpatient_hist', inpatientHistory.map((h) => h.id)),
        cageId: '',
        cageLabel: '',
        petId: cage.petId,
        petName: cage.petName || 'Pasien',
        petType: cage.petType || 'Cat',
        ownerName: cage.ownerName || 'Pemilik',
        ownerWhatsapp: cage.ownerWhatsapp || '-',
        diagnosis: cage.diagnosis || 'Perawatan Rawat Inap',
        admittedAt: cage.admittedAt || dischargeTimeFormatted,
        dischargedAt: dischargeTimeFormatted,
        veterinarian: cage.veterinarian || currentUser?.name || 'drh. Sarah Wijaya',
        observations: cage.observations || [],
      };

      setInpatientHistory((prev) => [historyRecord, ...prev]);

      // Automatically add a SOAP Record (Rekam Medis) for this completed stay!
      setSoapRecords((prev) => {
        const nextSoapId = generateSequentialId('soap', prev.map((s) => s.id));
        const soapRec: SoapRecord = {
          id: nextSoapId,
          petId: cage.petId!,
          petName: cage.petName || 'Pasien',
          ownerName: cage.ownerName || 'Pemilik',
          ownerWhatsapp: cage.ownerWhatsapp || '-',
          veterinarian: cage.veterinarian || currentUser?.name || 'drh. Sarah Wijaya',
          date: dischargeTimeFormatted,
          vitals: {
            weight: 0,
            temperature: cage.observations?.[0]?.temp || 38.5,
            heartRate: 0,
            respiratoryRate: 0,
          },
          soap: {
            subjective: `Rawat Inap Selesai.\nMasuk: ${cage.admittedAt}\nKeluar: ${dischargeTimeFormatted}`,
            objective: `Pasien dipulangkan dalam kondisi stabil. Log observasi rawat inap memiliki ${cage.observations?.length || 0} entri.`,
            assessment: `Selesai Rawat Inap - Diagnosis: ${cage.diagnosis}`,
            plan: `Edukasi owner mengenai pemeliharaan mandiri, pemulihan pasca tindakan medis, dan terapi rawat jalan di rumah.`,
          },
          prescriptions: [],
          serviceFee: 0,
        };
        return [soapRec, ...prev];
      });

      setPets((prev) =>
        prev.map((p) => (p.id === cage.petId ? { ...p, status: 'Sehat' } : p))
      );
    }
    updateCageStatus(cageId, 'Cleaning');
  };

  // ==========================================
  // INVENTORY & STOCK
  // ==========================================

  const restockItem = (itemId: string, addedQuantity: number) => {
    const today = new Date().toISOString().split('T')[0];
    setInventory((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              stockQuantity: item.stockQuantity + addedQuantity,
              lastRestocked: today,
            }
          : item
      )
    );
  };

  const addInventoryItem = (item: Omit<InventoryItem, 'id' | 'lastRestocked'>) => {
    const today = new Date().toISOString().split('T')[0];
    const nextInvId = generateSequentialId('inv', inventory.map((i) => i.id));
    const newItem: InventoryItem = {
      ...item,
      id: nextInvId,
      lastRestocked: today,
    };
    setInventory((prev) => [newItem, ...prev]);
  };

  const updateInventoryItem = (itemId: string, updatedData: Partial<InventoryItem>) => {
    setInventory((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...updatedData } : item))
    );
  };

  const deleteInventoryItem = (itemId: string) => {
    setInventory((prev) => prev.filter((item) => item.id !== itemId));
  };

  // ==========================================
  // BOOKING APPOINTMENTS
  // ==========================================

  const addBooking = (booking: Omit<BookingAppointment, 'id'>) => {
    const nextBkId = generateSequentialId('bk', bookings.map((b) => b.id));
    const newBooking: BookingAppointment = {
      ...booking,
      ownerWhatsapp: normalizePhoneWithZero(booking.ownerWhatsapp),
      id: nextBkId,
    };
    setBookings((prev) => [newBooking, ...prev]);
  };

  const updateBookingStatus = (id: string, status: BookingAppointment['status']) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status } : b))
    );
  };

  // ==========================================
  // AUTH & SESSION & STAFF MANAGEMENT
  // ==========================================

  const addStaff = (newStaff: Omit<StaffUser, 'id'>): { success: boolean; message: string } => {
    const usernameClean = newStaff.username.trim().toLowerCase();
    if (!usernameClean) {
      return { success: false, message: 'Username tidak boleh kosong.' };
    }
    if (staffList.some((s) => s.username.toLowerCase() === usernameClean)) {
      return { success: false, message: `Username "${newStaff.username}" sudah terdaftar.` };
    }
    const nextStaffId = generateSequentialId('staff', staffList.map((s) => s.id));
    const staffMember: StaffUser = {
      ...newStaff,
      id: nextStaffId,
      username: usernameClean,
      password: newStaff.password?.trim() || 'admin',
    };
    const nextList = [...staffList, staffMember];
    setStaffList(nextList);

    // Push to Google Spreadsheet if connected
    if (spreadsheetConfig.isConnected && spreadsheetConfig.webAppUrl) {
      pushTableToSpreadsheet(spreadsheetConfig.webAppUrl, 'staff', nextList);
    }
    return { success: true, message: `Admin / Staf ${newStaff.name} berhasil ditambahkan.` };
  };

  const deleteStaff = (id: string): { success: boolean; message: string } => {
    if (staffList.length <= 1) {
      return { success: false, message: 'Minimal harus ada 1 akun admin / staf terdaftar di sistem.' };
    }
    const target = staffList.find((s) => s.id === id);
    if (!target) {
      return { success: false, message: 'Data admin tidak ditemukan.' };
    }
    if (currentUser?.id === id) {
      return { success: false, message: 'Anda tidak dapat menghapus akun yang sedang aktif login.' };
    }
    const nextList = staffList.filter((s) => s.id !== id);
    setStaffList(nextList);

    if (spreadsheetConfig.isConnected && spreadsheetConfig.webAppUrl) {
      pushTableToSpreadsheet(spreadsheetConfig.webAppUrl, 'staff', nextList);
    }
    return { success: true, message: `Akun ${target.name} berhasil dihapus.` };
  };

  const updateStaff = (
    id: string,
    updatedData: Partial<StaffUser>
  ): { success: boolean; message: string } => {
    const target = staffList.find((s) => s.id === id);
    if (!target) {
      return { success: false, message: 'Data akun staf tidak ditemukan.' };
    }

    const payload = { ...updatedData };

    if (payload.name !== undefined) {
      const cleanName = payload.name.trim();
      if (!cleanName) {
        return { success: false, message: 'Nama lengkap tidak boleh kosong.' };
      }
      payload.name = cleanName;
    }

    if (payload.username !== undefined) {
      const cleanUname = payload.username.trim().toLowerCase();
      if (!cleanUname) {
        return { success: false, message: 'Username tidak boleh kosong.' };
      }
      if (cleanUname.length < 3) {
        return { success: false, message: 'Username minimal harus 3 karakter.' };
      }
      const duplicate = staffList.find(
        (s) => s.id !== id && s.username.toLowerCase() === cleanUname
      );
      if (duplicate) {
        return { success: false, message: `Username "${cleanUname}" sudah digunakan akun lain.` };
      }
      payload.username = cleanUname;
    }

    if (payload.password !== undefined) {
      const trimmedPass = payload.password.trim();
      if (!trimmedPass) {
        return { success: false, message: 'Kata sandi tidak boleh kosong.' };
      }
      if (trimmedPass.length < 3) {
        return { success: false, message: 'Kata sandi minimal harus 3 karakter.' };
      }
      payload.password = trimmedPass;
    }

    const updatedStaff: StaffUser = {
      ...target,
      ...payload,
    };

    const nextList = staffList.map((s) => (s.id === id ? updatedStaff : s));
    setStaffList(nextList);

    if (currentUser?.id === id) {
      setCurrentUser(updatedStaff);
    }

    if (spreadsheetConfig.isConnected && spreadsheetConfig.webAppUrl) {
      pushTableToSpreadsheet(spreadsheetConfig.webAppUrl, 'staff', nextList);
    }
    return { success: true, message: `Akun ${updatedStaff.name} berhasil diperbarui.` };
  };

  const updateStaffPassword = (id: string, newPassword: string): { success: boolean; message: string } => {
    const trimmed = newPassword.trim();
    if (!trimmed) {
      return { success: false, message: 'Password baru tidak boleh kosong.' };
    }
    if (trimmed.length < 3) {
      return { success: false, message: 'Password minimal harus 3 karakter.' };
    }
    const target = staffList.find((s) => s.id === id);
    if (!target) {
      return { success: false, message: 'Data admin tidak ditemukan.' };
    }
    const updatedStaff: StaffUser = {
      ...target,
      password: trimmed,
    };
    const nextList = staffList.map((s) => (s.id === id ? updatedStaff : s));
    setStaffList(nextList);

    if (currentUser?.id === id) {
      setCurrentUser(updatedStaff);
    }

    if (spreadsheetConfig.isConnected && spreadsheetConfig.webAppUrl) {
      pushTableToSpreadsheet(spreadsheetConfig.webAppUrl, 'staff', nextList);
    }
    return { success: true, message: `Password untuk ${target.name} berhasil diperbarui.` };
  };

  const loginStaff = (username: string, password: string): { success: boolean; message: string } => {
    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanUser) {
      return { success: false, message: 'Username wajib diisi.' };
    }
    if (!cleanPass) {
      return { success: false, message: 'Kata sandi wajib diisi.' };
    }

    let found = staffList.find((s) => s.username.toLowerCase() === cleanUser);
    if (!found) {
      found = INITIAL_STAFF.find((s) => s.username.toLowerCase() === cleanUser);
    }
    if (!found) {
      return { success: false, message: 'Username tidak terdaftar di sistem klinik.' };
    }

    // Periksa password sesuai yang tersimpan di data staf/pengaturan (default 'admin' jika belum disetel)
    const expectedPassword = String(found.password ?? 'admin').trim();
    if (cleanPass !== expectedPassword) {
      return { success: false, message: 'Kata sandi salah. Silakan periksa kembali kata sandi Anda.' };
    }

    setCurrentUser(found);
    return { success: true, message: 'Login berhasil.' };
  };

  const logoutStaff = () => {
    setCurrentUser(null);
  };

  const setTrackedTicket = (ticket: string): boolean => {
    const clean = ticket.trim().toUpperCase();
    const found = queues.find((q) => q.ticketNumber.toUpperCase() === clean);
    if (found) {
      setActivePatientTicket(found.ticketNumber);
      return true;
    }
    return false;
  };

  const trackByPhone = (phone: string | number): boolean => {
    const cleanPhone = normalizePhoneWithZero(phone);
    if (!cleanPhone) return false;
    // Hanya cari antrean yang AKTIF (Menunggu / Di Ruang Poli). Pasien yang sudah selesai tidak muncul lagi dalam antrean aktif.
    const activeQueues = queues.filter(
      (q) =>
        normalizePhoneWithZero(q.ownerWhatsapp) === cleanPhone &&
        q.status !== 'Selesai' &&
        q.status !== 'Dibatalkan'
    );
    if (activeQueues.length > 0) {
      const latest = activeQueues[activeQueues.length - 1];
      setActivePatientTicket(latest.ticketNumber);
      return true;
    }
    return false;
  };

  const clearPatientSession = () => {
    setActivePatientTicket(null);
  };

  const dismissCallNotification = () => {
    setCallNotification(null);
  };

  const getPetById = (id: string) => pets.find((p) => p.id === id);
  const getOwnerByPhone = (phone: string | number) => {
    const cleanTarget = normalizePhoneWithZero(phone);
    if (!cleanTarget) return undefined;
    return owners.find((o) => normalizePhoneWithZero(o.whatsapp) === cleanTarget);
  };
  const getPetsByOwnerPhone = (phone: string | number, ownerId?: string) => {
    const cleanTarget = normalizePhoneWithZero(phone);
    const targetDigits = String(phone ?? '').replace(/\D/g, '');
    return pets.filter((p) => {
      if (ownerId && p.ownerId && p.ownerId === ownerId) return true;
      if (cleanTarget && normalizePhoneWithZero(p.ownerWhatsapp) === cleanTarget) return true;
      if (targetDigits && String(p.ownerWhatsapp ?? '').replace(/\D/g, '') === targetDigits) return true;
      return false;
    });
  };

  const addFeedback = (item: Omit<CustomerFeedback, 'id' | 'submittedAt'>) => {
    const newId = generateSequentialId('fb', feedbacks.map((f) => f.id));
    const now = new Date();
    const datePart = now.toLocaleDateString('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const timePart = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    const submittedAt = `${datePart} ${timePart} WIB`;

    const newRecord: CustomerFeedback = {
      ...item,
      ownerWhatsapp: item.ownerWhatsapp ? normalizePhoneWithZero(item.ownerWhatsapp) : undefined,
      id: newId,
      submittedAt,
    };

    setFeedbacks((prev) => [newRecord, ...prev]);

    // Push record ke Google Spreadsheet secara real-time
    if (spreadsheetConfig.isConnected && spreadsheetConfig.webAppUrl) {
      pushSingleRecordToSpreadsheet(spreadsheetConfig.webAppUrl, 'feedbacks', newRecord);
    }
  };

  const deleteFeedback = (id: string) => {
    setFeedbacks((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <ClinicContext.Provider
      value={{
        owners,
        pets,
        queues,
        inventory,
        cages,
        inpatientHistory,
        soapRecords,
        bookings,
        feedbacks,
        staffList,
        currentUser,
        currentServingTicket,
        activePatientTicket,
        callNotification,
        spreadsheetConfig,
        syncStatus,
        lastSyncMessage,
        isLargeDataMode,
        connectSpreadsheet,
        disconnectSpreadsheet,
        updateSpreadsheetConfig,
        syncToSpreadsheet,
        syncFromSpreadsheet,
        importDatabase,
        clearAllData,
        registerPatient,
        callQueue,
        completeQueue,
        deleteQueue,
        deleteOwner,
        deletePet,
        deleteSoapRecord,
        saveSoapRecord,
        updateCageStatus,
        addCageObservation,
        admitPetToCage,
        dischargeCage,
        restockItem,
        addInventoryItem,
        updateInventoryItem,
        deleteInventoryItem,
        addBooking,
        updateBookingStatus,
        addFeedback,
        deleteFeedback,
        addStaff,
        deleteStaff,
        updateStaff,
        updateStaffPassword,
        loginStaff,
        logoutStaff,
        setTrackedTicket,
        trackByPhone,
        clearPatientSession,
        dismissCallNotification,
        getPetById,
        getOwnerByPhone,
        getPetsByOwnerPhone,
        resetToInitialData,
        updateOwner,
        updatePet,
        sanitizeAllExistingDates,
      }}
    >
      {children}
    </ClinicContext.Provider>
  );
};

export const useClinic = () => {
  const context = useContext(ClinicContext);
  if (!context) {
    throw new Error('useClinic must be used within a ClinicProvider');
  }
  return context;
};
