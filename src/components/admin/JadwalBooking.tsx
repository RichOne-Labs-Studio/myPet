import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Filter,
  CheckCircle2,
  XCircle,
  User,
  PawPrint,
  ArrowRight,
  List,
  Grid,
  Search,
} from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { AppRoute } from '../../navigation';
import { BookingSchedule, ServiceType, PetType } from '../../types';

interface Props {
  navigate: (to: AppRoute) => void;
}

export const JadwalBooking: React.FC<Props> = ({ navigate }) => {
  const { bookings, addBooking, updateBookingStatus, registerPatient } = useClinic();

  const [viewMode, setViewMode] = useState<'agenda' | 'calendar'>('agenda');
  const [filterService, setFilterService] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(8); // 8 = September
  const [showAddModal, setShowAddModal] = useState(false);

  const monthsList = [
    { value: 0, label: 'Januari' },
    { value: 1, label: 'Februari' },
    { value: 2, label: 'Maret' },
    { value: 3, label: 'April' },
    { value: 4, label: 'Mei' },
    { value: 5, label: 'Juni' },
    { value: 6, label: 'Juli' },
    { value: 7, label: 'Agustus' },
    { value: 8, label: 'September' },
    { value: 9, label: 'Oktober' },
    { value: 10, label: 'November' },
    { value: 11, label: 'Desember' },
  ];

  const yearsList = [2025, 2026, 2027, 2028];

  // New Booking form
  const [bDate, setBDate] = useState('2026-09-19');
  const [bTime, setBTime] = useState('10:00');
  const [bOwnerName, setBOwnerName] = useState('');
  const [bOwnerPhone, setBOwnerPhone] = useState('');
  const [bPetName, setBPetName] = useState('');
  const [bPetType, setBPetType] = useState<PetType>('Cat');
  const [bService, setBService] = useState<ServiceType>('Consultation');
  const [bNotes, setBNotes] = useState('');

  const services = ['all', 'Consultation', 'Vaccine', 'Grooming', 'Hotel', 'Surgery'];

  const filteredBookings = bookings.filter((b) => {
    if (filterService !== 'all' && b.serviceType !== filterService) return false;
    const bDateObj = new Date(b.date);
    if (bDateObj.getFullYear() !== selectedYear || bDateObj.getMonth() !== selectedMonth) {
      return false;
    }
    return true;
  });

  const handleCreateBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bOwnerName.trim() || !bPetName.trim()) return;

    addBooking({
      date: bDate,
      time: bTime,
      ownerName: bOwnerName.trim(),
      ownerWhatsapp: bOwnerPhone.trim(),
      petName: bPetName.trim(),
      petType: bPetType,
      serviceType: bService,
      status: 'Terjadwal',
      notes: bNotes.trim(),
    });

    setShowAddModal(false);
    setBOwnerName('');
    setBOwnerPhone('');
    setBPetName('');
    setBNotes('');
  };

  const handleCheckInToQueue = (booking: BookingSchedule) => {
    registerPatient({
      owner: {
        name: booking.ownerName,
        whatsapp: booking.ownerWhatsapp,
        address: 'Alamat Klien Booking',
      },
      pet: {
        name: booking.petName,
        type: booking.petType || 'Cat',
        breed: 'Ras',
        ageOrDob: 'Dewasa',
        sex: 'Jantan',
      },
      visit: {
        chiefComplaint: `Kunjungan Booking: ${booking.serviceType}${booking.notes ? ` - ${booking.notes}` : ''}`,
        serviceType: booking.serviceType,
      },
    });

    updateBookingStatus(booking.id, 'Selesai');
    navigate('/admin/dashboard');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200/80">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-fuchsia-700" />
            <span>Jadwal Booking & Janji Temu Klinis</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Agenda terjadwal konsultasi spesialis, operasi sterilisasi, vaksinasi terjadwal, dan grooming.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center bg-neutral-100 p-1 rounded-xl border border-neutral-200 text-xs">
            <button
              onClick={() => setViewMode('agenda')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1 font-semibold transition ${
                viewMode === 'agenda' ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Agenda List</span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1 font-semibold transition ${
                viewMode === 'calendar' ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Matriks Kalender</span>
            </button>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold text-xs shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Janji Temu</span>
          </button>
        </div>
      </div>

      {/* Month & Year Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-neutral-200/80 text-xs shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="text-neutral-700 font-semibold">Periode:</span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-1.5 text-neutral-900 font-medium focus:outline-hidden focus:border-fuchsia-500"
          >
            {monthsList.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-1.5 text-neutral-900 font-medium focus:outline-hidden focus:border-fuchsia-500"
          >
            {yearsList.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="text-neutral-500 font-mono text-[11px]">
          Menampilkan <strong className="text-neutral-900">{filteredBookings.length}</strong> jadwal untuk {monthsList[selectedMonth].label} {selectedYear}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto bg-white p-2.5 rounded-2xl border border-neutral-200/80 text-xs shadow-2xs">
        <span className="text-neutral-500 font-semibold px-2">Layanan:</span>
        {services.map((svc) => (
          <button
            key={svc}
            onClick={() => setFilterService(svc)}
            className={`px-3 py-1 rounded-xl font-semibold transition whitespace-nowrap ${
              filterService === svc
                ? 'bg-fuchsia-700 text-white shadow-2xs'
                : 'bg-neutral-50 text-neutral-600 hover:text-neutral-900 border border-neutral-200'
            }`}
          >
            {svc === 'all' ? 'Semua Jadwal' : svc}
          </button>
        ))}
      </div>

      {/* AGENDA VIEW */}
      {viewMode === 'agenda' && (
        <div className="space-y-3">
          {filteredBookings.length === 0 ? (
            <div className="py-12 text-center text-neutral-500 bg-white rounded-2xl border border-neutral-200/80 text-xs">
              Tidak ada jadwal booking pada filter ini.
            </div>
          ) : (
            filteredBookings.map((b) => (
              <div
                key={b.id}
                className="bg-white border border-neutral-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-neutral-300 shadow-xs transition"
              >
                {/* Date & Time Badge */}
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl bg-neutral-50 border border-neutral-200 flex flex-col items-center justify-center font-mono">
                    <span className="text-[10px] uppercase text-fuchsia-700 font-bold">
                      {new Date(b.date).toLocaleDateString('id-ID', { month: 'short' })}
                    </span>
                    <span className="text-lg font-black text-neutral-900">
                      {new Date(b.date).getDate()}
                    </span>
                    <span className="text-[10px] text-neutral-500">{b.time}</span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-base text-neutral-900">{b.petName}</h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200">
                        {b.serviceType}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          b.status === 'Terjadwal'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : b.status === 'Selesai'
                            ? 'bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {b.status}
                      </span>
                    </div>

                    <p className="text-xs text-neutral-600 mt-1">
                      Klien: <strong className="text-neutral-800">{b.ownerName}</strong> ({b.ownerWhatsapp}) • Jenis: {b.petType}
                    </p>

                    {b.notes && (
                      <p className="text-[11px] text-neutral-500 italic mt-0.5">
                        Catatan: {b.notes}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center">
                  {b.status === 'Terjadwal' && (
                    <button
                      onClick={() => handleCheckInToQueue(b)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold text-xs shadow-xs transition"
                      title="Masukkan pasien langsung ke Antrean Live Poli"
                    >
                      <span>Check-in ke Antrean Poli</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {b.status === 'Terjadwal' && (
                    <button
                      onClick={() => updateBookingStatus(b.id, 'Batal')}
                      className="p-2 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Batalkan janji temu"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* CALENDAR MATRIX VIEW (FULL MONTH) */}
      {viewMode === 'calendar' && (() => {
        const firstDayOfMonth = new Date(selectedYear, selectedMonth, 1);
        const lastDayOfMonth = new Date(selectedYear, selectedMonth + 1, 0);
        const daysInMonth = lastDayOfMonth.getDate();
        let startDayIndex = firstDayOfMonth.getDay() - 1; // Mon = 0, Sun = 6
        if (startDayIndex === -1) startDayIndex = 6;

        return (
          <div className="bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-neutral-900">
                Kalender Bulan {monthsList[selectedMonth].label} {selectedYear}
              </h3>
              <span className="text-xs text-neutral-500 font-mono">
                Total {daysInMonth} Hari
              </span>
            </div>

            <div className="grid grid-cols-7 gap-2 text-center text-xs font-mono font-bold text-neutral-500 pb-3 border-b border-neutral-200">
              <span>Senin</span>
              <span>Selasa</span>
              <span>Rabu</span>
              <span>Kamis</span>
              <span>Jumat</span>
              <span className="text-fuchsia-700 font-bold">Sabtu</span>
              <span className="text-rose-600">Minggu</span>
            </div>

            <div className="grid grid-cols-7 gap-2 pt-3">
              {Array.from({ length: startDayIndex }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[95px] rounded-xl bg-neutral-50/50 border border-neutral-100 opacity-60" />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const dayBookings = bookings.filter((b) => {
                  if (filterService !== 'all' && b.serviceType !== filterService) return false;
                  return b.date === dateStr;
                });

                return (
                  <div
                    key={dayNum}
                    className="min-h-[105px] rounded-xl bg-white p-2 border border-neutral-200 flex flex-col justify-between hover:border-neutral-300 shadow-2xs transition"
                  >
                    <div className="flex justify-between items-center text-[10px] font-mono text-neutral-500">
                      <span className="font-bold text-neutral-900">{dayNum}</span>
                      {dayBookings.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-800 font-bold text-[9px] border border-fuchsia-200">
                          {dayBookings.length}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 my-1 overflow-y-auto max-h-[60px]">
                      {dayBookings.map((bk) => (
                        <div
                          key={bk.id}
                          className="text-[10px] bg-neutral-50 border border-neutral-200 text-neutral-700 p-1 rounded-sm truncate"
                          title={`${bk.time} - ${bk.petName} (${bk.serviceType}) - ${bk.ownerName}`}
                        >
                          {bk.time} {bk.petName}
                        </div>
                      ))}
                    </div>

                    <span className="text-[9px] text-neutral-400 font-mono truncate">
                      {dayBookings.length > 0 ? `${dayBookings.length} booking` : '-'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ADD BOOKING MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl max-w-md w-full p-6 text-neutral-900 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-4">
              <h3 className="font-bold text-base text-neutral-900">Buat Janji Temu Klinis Baru</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-neutral-400 hover:text-neutral-700"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBooking} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Tanggal</label>
                  <input
                    type="date"
                    required
                    value={bDate}
                    onChange={(e) => setBDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-mono focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Jam Temu</label>
                  <input
                    type="time"
                    required
                    value={bTime}
                    onChange={(e) => setBTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-mono focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Nama Pemilik</label>
                <input
                  type="text"
                  required
                  value={bOwnerName}
                  onChange={(e) => setBOwnerName(e.target.value)}
                  placeholder="Nama klien"
                  className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">WhatsApp / Telepon</label>
                <input
                  type="tel"
                  required
                  value={bOwnerPhone}
                  onChange={(e) => setBOwnerPhone(e.target.value)}
                  placeholder="081234567890"
                  className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-mono focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Nama Hewan</label>
                  <input
                    type="text"
                    required
                    value={bPetName}
                    onChange={(e) => setBPetName(e.target.value)}
                    placeholder="Nama pet"
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Jenis Hewan</label>
                  <select
                    value={bPetType}
                    onChange={(e) => setBPetType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  >
                    <option value="Cat">🐱 Kucing</option>
                    <option value="Dog">🐶 Anjing</option>
                    <option value="Rabbit">🐰 Kelinci</option>
                    <option value="Exotic">🦜 Eksotik</option>
                    <option value="Farm Animal">🐄 Hewan Ternak</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Layanan yang Dituju</label>
                <select
                  value={bService}
                  onChange={(e) => setBService(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 font-medium focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                >
                  <option value="Consultation">Konsultasi Medis Umum</option>
                  <option value="Vaccine">Vaksinasi / Booster</option>
                  <option value="Grooming">Grooming & Spa Medis</option>
                  <option value="Hotel">Penitipan / Rawat Inap (Hotel)</option>
                  <option value="Surgery">Operasi / Tindakan Bedah</option>
                </select>
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Catatan Tambahan</label>
                <input
                  type="text"
                  value={bNotes}
                  onChange={(e) => setBNotes(e.target.value)}
                  placeholder="Contoh: Vaksin F4 booster, puasa dari jam 8 pagi"
                  className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold shadow-xs"
                >
                  Jadwalkan Janji Temu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
