import { Owner, Pet, VisitQueue, SoapRecord, InpatientCage, InventoryItem, BookingAppointment, StaffUser, CustomerFeedback } from './types';

// Staf & Dokter terdaftar dari Google Spreadsheet Sheet 8_Staf
export const INITIAL_STAFF: StaffUser[] = [
  {
    id: 'staff-1790051436389',
    username: 'arsi.vet',
    name: 'drh. Arsi Kurniawan',
    role: 'Dokter Hewan',
    avatar: '👩‍⚕️',
    password: '12345',
  },
  {
    id: 'staff-admin',
    username: 'admin',
    name: 'Administrator Klinik',
    role: 'Staff Admin / Frontdesk',
    avatar: '🛡️',
    password: 'admin',
  },
];

// Data Pemilik default kosong (mengikuti isi Google Spreadsheet)
export const INITIAL_OWNERS: Owner[] = [];

// Data Pasien default kosong (mengikuti isi Google Spreadsheet)
export const INITIAL_PETS: Pet[] = [];

// Data Antrean Pasien default kosong (mengikuti isi Google Spreadsheet)
export const INITIAL_QUEUES: VisitQueue[] = [];

// Data Dummy Stok Obat & BHP Medis dikosongkan
export const INITIAL_INVENTORY: InventoryItem[] = [];

// Data Dummy Rekam Medis (SOAP) dikosongkan
export const INITIAL_SOAP_RECORDS: SoapRecord[] = [];

// Fasilitas Ruang Rawat Inap (12 Kandang Standar Klinik dalam kondisi Siap/Available tanpa pasien dummy)
export const INITIAL_CAGES: InpatientCage[] = [
  {
    id: 'A1',
    label: 'Kandang A-1 (Kucing/Kecil)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'A2',
    label: 'Kandang A-2 (Kucing/Kecil)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'A3',
    label: 'Kandang A-3 (Kucing/Kecil)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'A4',
    label: 'Kandang A-4 (Kucing/Kecil)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'A5',
    label: 'Kandang A-5 (Kucing/Kecil)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'A6',
    label: 'Kandang A-6 (Kucing/Kecil)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'B1',
    label: 'Kandang B-1 (Anjing/Isolasi)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'B2',
    label: 'Kandang B-2 (Anjing/Besar)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'B3',
    label: 'Kandang B-3 (Anjing/Besar)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'B4',
    label: 'Kandang B-4 (Anjing/Besar)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'B5',
    label: 'Kandang B-5 (Anjing/Besar)',
    status: 'Available',
    observations: [],
  },
  {
    id: 'B6',
    label: 'Kandang B-6 (Anjing/Besar)',
    status: 'Available',
    observations: [],
  },
];

// Data Dummy Jadwal Booking dikosongkan
export const INITIAL_BOOKINGS: BookingAppointment[] = [];

// Data Feedback & Tingkat Kepuasan Pelanggan dikosongkan (Bersih / Siap Sinkron Spreadsheet)
export const INITIAL_FEEDBACKS: CustomerFeedback[] = [];
