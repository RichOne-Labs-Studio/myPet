import React, { useState } from 'react';
import { Heart, LogOut, Activity, Clock, AlertCircle, CheckCircle2, Volume2, User, ChevronRight, Phone, PawPrint, ShieldCheck } from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { AppRoute } from '../../navigation';
import { VierLogo } from '../VierLogo';
import { formatDateTimeDisplay, isToday } from '../../utils/dateUtils';

interface Props {
  navigate: (to: AppRoute) => void;
}

export const PatientDashboard: React.FC<Props> = ({ navigate }) => {
  const {
    queues,
    currentServingTicket,
    activePatientTicket,
    clearPatientSession,
    getPetsByOwnerPhone,
    getOwnerByPhone,
    setTrackedTicket,
    pets,
  } = useClinic();

  const [activeTab, setActiveTab] = useState<'status' | 'pets'>('status');

  // Find the active queue item
  const myQueue = queues.find((q) => q.ticketNumber === activePatientTicket) || (activePatientTicket ? undefined : queues[queues.length - 1]);
  const ticketNum = myQueue ? myQueue.ticketNumber : '';

  const ownerRecord = myQueue ? getOwnerByPhone(myQueue.ownerWhatsapp) : null;
  const informedConsentStatement = ownerRecord?.notes || ownerRecord?.informedConsent || 'Disetujui: Bebas tuntutan resiko medis sesuai kaidah kedokteran hewan';

  // Find pet
  const myPet = myQueue
    ? pets.find((p) => p.id === myQueue.petId) || {
        name: myQueue.petName,
        type: myQueue.petType,
        breed: 'Hewan Peliharaan',
        ageOrDob: '-',
        sex: 'Jantan' as const,
        status: 'Perawatan' as const,
      }
    : null;

  // Calculate position in queue (hanya antrean hari ini)
  const waitingQueues = queues.filter((q) => (q.status === 'Menunggu' || q.status === 'Di Ruang Poli') && isToday(q.createdAt));
  const myIndexInWaiting = waitingQueues.findIndex((q) => q.ticketNumber === ticketNum);
  const peopleAhead = myIndexInWaiting > 0 ? myIndexInWaiting : 0;
  const estimatedMins = myQueue?.status === 'Di Ruang Poli' ? 0 : Math.max(5, (peopleAhead + 1) * 12);

  const isNowServing = myQueue?.status === 'Di Ruang Poli';
  const isCompleted = myQueue?.status === 'Selesai';

  const handleLogout = () => {
    clearPatientSession();
    navigate('/');
  };

  const otherPets = myQueue ? getPetsByOwnerPhone(myQueue.ownerWhatsapp) : [];

  if (!myQueue) {
    return (
      <div id="patient-dashboard-root" className="min-h-screen bg-neutral-50 flex items-center justify-center p-4 font-sans text-neutral-800">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full border border-neutral-200 shadow-sm text-center space-y-4">
          <VierLogo className="h-10 w-auto mx-auto" />
          <div className="w-12 h-12 rounded-2xl bg-fuchsia-50 text-fuchsia-700 flex items-center justify-center mx-auto">
            <Activity className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-neutral-900">Belum Ada Antrean Aktif</h2>
          <p className="text-xs text-neutral-500">
            Anda belum memiliki tiket antrean yang sedang aktif. Silakan daftar antrean baru atau cari tiket Anda di beranda.
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={() => navigate('/pasien/daftar')}
              className="w-full py-3 px-4 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold text-xs shadow-xs transition cursor-pointer"
            >
              Ambil Nomor Antrean Pasien
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 px-4 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold text-xs transition cursor-pointer"
            >
              Kembali ke Beranda
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="patient-dashboard-root" className="min-h-screen bg-neutral-50 flex flex-col md:flex-row font-sans text-neutral-800">
      {/* Patient Sidebar: Strictly contains only "Dashboard Status" and "Keluar" */}
      <aside id="patient-sidebar" className="w-full md:w-64 bg-white border-r border-fuchsia-100 flex flex-col justify-between shrink-0 shadow-xs overflow-y-auto max-h-screen">
        <div>
          {/* Clinic Brand */}
          <div className="p-4 border-b border-fuchsia-50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-fuchsia-700 text-white flex items-center justify-center shrink-0 shadow-md shadow-fuchsia-700/25">
                <PawPrint className="w-6 h-6 fill-white/20 text-white stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <span className="font-extrabold text-base text-neutral-900 tracking-tight flex items-center gap-1">
                  myPet
                </span>
                <p className="text-[10px] text-neutral-500 leading-tight">Portal Pasien & Klien</p>
              </div>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Sistem Aktif"></span>
          </div>

          {/* Nav Items */}
          <nav className="p-3 space-y-1">
            <button
              id="nav-patient-status"
              onClick={() => setActiveTab('status')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition ${
                activeTab === 'status'
                  ? 'bg-fuchsia-50 text-fuchsia-900 border border-fuchsia-200/80 shadow-xs'
                  : 'text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <Activity className="w-4 h-4 text-fuchsia-700" />
              <span>Dashboard Status</span>
            </button>

            {otherPets.length > 1 && (
              <button
                onClick={() => setActiveTab('pets')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition ${
                  activeTab === 'pets'
                    ? 'bg-fuchsia-50 text-fuchsia-900 border border-fuchsia-200/80 shadow-xs'
                    : 'text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                <User className="w-4 h-4 text-fuchsia-700" />
                <span>Hewan Saya ({otherPets.length})</span>
              </button>
            )}
          </nav>
        </div>

        {/* Bottom "Keluar" Action */}
        <div className="p-4 border-t border-neutral-100">
          <div className="p-3 rounded-xl bg-neutral-50 mb-3 border border-neutral-100 text-xs text-neutral-500">
            <p className="font-semibold text-neutral-700">{myQueue?.ownerName || 'Klien Pasien'}</p>
            <p className="text-[11px] text-neutral-400">{myQueue?.ownerWhatsapp}</p>
          </div>

          <button
            id="btn-patient-logout"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-100 transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-8 max-w-4xl mx-auto w-full overflow-y-auto">
        {/* Urgent Alert Banner if currently called */}
        {isNowServing && (
          <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-fuchsia-700 to-rose-700 text-white shadow-lg shadow-fuchsia-900/20 flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-2xl">
                📢
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black tracking-tight">GILIRAN ANDA TELAH DIPANGGIL!</h3>
                <p className="text-xs text-fuchsia-100 mt-0.5">
                  Silakan masuk membawa <strong className="text-white underline">{myQueue?.petName}</strong> ke Ruang Poli 1 Dokter Hewan.
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-block px-3 py-1.5 rounded-full bg-white text-fuchsia-900 text-xs font-black">
              Poli 1
            </span>
          </div>
        )}

        {/* MASSIVE LIVE QUEUE TRACKER CARD */}
        <section id="massive-live-queue-tracker" className="bg-white rounded-3xl p-6 sm:p-8 border border-fuchsia-100 shadow-md shadow-fuchsia-500/5 mb-8 relative overflow-hidden">
          {/* Subtle decorative background blur */}
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-fuchsia-100/40 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-rose-100/30 blur-3xl pointer-events-none" />

          {/* Top Status Indicators */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-neutral-100">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">Live Tracker Antrean</span>
              <h2 className="text-xl sm:text-2xl font-black text-neutral-900 mt-0.5">
                Poli Umum & Spesialis Hewan
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${
                isNowServing
                  ? 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300 animate-bounce'
                  : isCompleted
                  ? 'bg-neutral-100 text-neutral-700 border-neutral-300'
                  : 'bg-amber-100 text-amber-800 border-amber-300'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isNowServing ? 'bg-fuchsia-600' : isCompleted ? 'bg-neutral-500' : 'bg-amber-500'}`} />
                {myQueue?.status || 'Menunggu'}
              </span>
            </div>
          </div>

          {/* Giant Ticket Presentation */}
          <div className="py-8 sm:py-10 text-center">
            <p className="text-xs sm:text-sm font-semibold text-neutral-400 uppercase tracking-widest mb-2">
              Nomor Tiket Anda
            </p>
            <div className="inline-block relative">
              <span className="text-6xl sm:text-8xl font-black tracking-tight text-neutral-900 font-mono">
                {ticketNum}
              </span>
              <span className="block text-xs font-semibold text-fuchsia-700 mt-2 bg-fuchsia-50 py-1 px-3 rounded-full border border-fuchsia-100 mx-auto w-fit">
                Layanan: {myQueue?.serviceType || 'Consultation'}
              </span>
            </div>
          </div>

          {/* Live Dynamic Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-neutral-100">
            {/* Now Serving */}
            <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-100 text-center">
              <div className="flex items-center justify-center gap-1.5 text-xs text-neutral-500 font-medium mb-1">
                <Volume2 className="w-3.5 h-3.5 text-fuchsia-700" />
                <span>Sedang Dilayani</span>
              </div>
              <p className="text-2xl sm:text-3xl font-black text-fuchsia-700 font-mono">
                {currentServingTicket || '-'}
              </p>
              <p className="text-[11px] text-neutral-400 mt-1">Ruang Pemeriksaan Poli 1</p>
            </div>

            {/* Waiting Ahead */}
            <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-100 text-center">
              <div className="flex items-center justify-center gap-1.5 text-xs text-neutral-500 font-medium mb-1">
                <Activity className="w-3.5 h-3.5 text-neutral-600" />
                <span>Antrean di Depan Anda</span>
              </div>
              <p className="text-2xl sm:text-3xl font-black text-neutral-800">
                {isCompleted ? 0 : peopleAhead} <span className="text-xs font-normal text-neutral-400">pasien</span>
              </p>
              <p className="text-[11px] text-neutral-400 mt-1">
                {isCompleted ? 'Pemeriksaan selesai' : isNowServing ? 'Giliran Anda sekarang!' : 'Mohon bersiap'}
              </p>
            </div>

            {/* Estimated Waiting Time */}
            <div className="bg-fuchsia-50/60 p-4 rounded-2xl border border-fuchsia-100 text-center">
              <div className="flex items-center justify-center gap-1.5 text-xs text-fuchsia-800 font-medium mb-1">
                <Clock className="w-3.5 h-3.5 text-fuchsia-700" />
                <span>Estimasi Waktu Tunggu</span>
              </div>
              <p className="text-2xl sm:text-3xl font-black text-fuchsia-700">
                {isCompleted ? '0' : isNowServing ? '0' : `~${estimatedMins}`} <span className="text-xs font-normal text-neutral-500">menit</span>
              </p>
              <p className="text-[11px] text-fuchsia-700/80 mt-1">Pembaruan otomatis real-time</p>
            </div>
          </div>
        </section>

        {/* SUMMARY OF PET'S PROFILE */}
        <section id="pet-profile-summary" className="bg-white rounded-2xl p-6 border border-neutral-200/80 shadow-xs mb-8">
          <div className="flex items-center justify-between pb-4 border-b border-neutral-100 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-fuchsia-100 text-fuchsia-800 flex items-center justify-center text-2xl font-bold">
                {myPet?.type === 'Cat' ? '🐱' : myPet?.type === 'Dog' ? '🐶' : myPet?.type === 'Rabbit' ? '🐰' : '🦜'}
              </div>
              <div>
                <h3 className="text-lg font-bold text-neutral-900">{myQueue?.petName || myPet?.name || 'Hewan Peliharaan'}</h3>
                <p className="text-xs text-neutral-500">{myPet?.breed || 'Domestik'} • {myPet?.ageOrDob} • {myPet?.sex}</p>
              </div>
            </div>

            <span className="text-xs px-3 py-1 rounded-full font-bold bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200">
              Status: {myPet?.status || 'Perawatan'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-100 space-y-1">
              <span className="font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Keluhan Saat Pendaftaran:</span>
              <p className="font-medium text-neutral-800 text-sm">{myQueue?.chiefComplaint || 'Pemeriksaan umum rutin'}</p>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-100 space-y-1">
              <span className="font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Waktu Masuk Antrean:</span>
              <p className="font-medium text-neutral-800 text-sm">{myQueue?.createdAt ? formatDateTimeDisplay(myQueue.createdAt) : '-'}</p>
              {myQueue?.assignedDoctor && (
                <p className="text-neutral-500 text-[11px]">Dokter Pemeriksa: <span className="font-semibold text-neutral-700">{myQueue.assignedDoctor}</span></p>
              )}
            </div>
          </div>

          {/* Quick instructions for pet owner */}
          <div className="mt-5 p-3.5 rounded-xl bg-fuchsia-50 border border-fuchsia-100 text-xs text-fuchsia-900 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-fuchsia-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Petunjuk Kunjungan:</p>
              <p className="text-fuchsia-800 mt-0.5">
                Pastikan hewan berada di dalam pet cargo / menggunakan tali penuntun saat menunggu di area resepsionis. Ketika nomor Anda dipanggil, mohon segera menuju Poli 1.
              </p>
            </div>
          </div>

          {/* INFORMED CONSENT STATEMENT PROOF */}
          <div className="mt-4 p-4 rounded-xl bg-neutral-50 border border-neutral-200/80 text-xs text-neutral-700 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-neutral-900">
              <ShieldCheck className="w-4 h-4 text-fuchsia-700" />
              <span>Bukti Persetujuan Tindakan (Informed Consent)</span>
            </div>
            <p className="italic text-neutral-600 bg-white p-3 rounded-lg border border-neutral-100 font-sans leading-relaxed">
              &ldquo;{informedConsentStatement}&rdquo;
            </p>
            <p className="text-[10px] text-neutral-400">
              Dicatat pada database (Kolom Catatan / Notes • Sheet 1_Pemilik) sebagai bukti persetujuan pemilik atas tindakan medis klinik.
            </p>
          </div>
        </section>

        {/* Switch ticket option if client registered multiple pets */}
        {otherPets.length > 1 && (
          <section className="bg-white rounded-2xl p-5 border border-neutral-200 text-xs">
            <h4 className="font-bold text-neutral-900 mb-2">Hewan Lain Terdaftar di Kontak Ini:</h4>
            <div className="flex flex-wrap gap-2">
              {otherPets.map((p) => {
                const petQueue = queues.find((q) => q.petId === p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      if (petQueue) setTrackedTicket(petQueue.ticketNumber);
                    }}
                    className={`px-3 py-2 rounded-xl border text-left flex items-center gap-2 transition ${
                      petQueue?.ticketNumber === ticketNum
                        ? 'border-fuchsia-500 bg-fuchsia-50 font-bold text-fuchsia-900'
                        : 'border-neutral-200 hover:bg-neutral-50 text-neutral-700'
                    }`}
                  >
                    <span>{p.type === 'Cat' ? '🐱' : p.type === 'Dog' ? '🐶' : p.type === 'Rabbit' ? '🐰' : '🦜'}</span>
                    <span>{p.name}</span>
                    {petQueue && (
                      <span className="bg-fuchsia-700 text-white text-[10px] px-1.5 py-0.5 rounded-sm font-mono">
                        {petQueue.ticketNumber}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
