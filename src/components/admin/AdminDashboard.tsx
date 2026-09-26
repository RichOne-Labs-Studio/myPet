import React, { useState, useMemo } from 'react';
import {
  Users,
  Clock,
  Hotel,
  Volume2,
  FileText,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Activity,
  ArrowRight,
  Filter,
  PieChart,
  Sparkles,
  Calendar,
  Lock,
  Shield,
  Crown,
} from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { AppRoute } from '../../navigation';
import { VisitQueue } from '../../types';
import { formatTimeOnly, isToday } from '../../utils/dateUtils';
import { canViewRevenue } from '../../utils/authUtils';
import { VisitTrendAnalytics } from '../analytics/VisitTrendAnalytics';

interface Props {
  navigate: (to: AppRoute) => void;
  onSelectPatientForSoap?: (queue: VisitQueue) => void;
}

export const AdminDashboard: React.FC<Props> = ({ navigate, onSelectPatientForSoap }) => {
  const {
    queues,
    currentServingTicket,
    callQueue,
    completeQueue,
    cages,
    soapRecords,
    bookings,
    currentUser,
  } = useClinic();

  const [queueFilter, setQueueFilter] = useState<'all' | 'Menunggu' | 'Di Ruang Poli' | 'Selesai'>('all');
  const [queueDateScope, setQueueDateScope] = useState<'today' | 'all'>('today');

  // Filters for Revenue Estimation
  const [revenueMonthFilter, setRevenueMonthFilter] = useState<string>(String(new Date().getMonth())); // default current month "0" - "11"
  const [revenueYearFilter, setRevenueYearFilter] = useState<string>(String(new Date().getFullYear())); // default current year
  const [revenueSpecificDate, setRevenueSpecificDate] = useState<string>(''); // default empty (all dates in month)

  // Stats & Calculations memoized for ultra-fast rendering & zero tab-switch lag
  const {
    todayQueues,
    activeQueues,
    inPoliQueues,
    completedQueues,
    occupiedCages,
    displayedQueues,
    visitTrendData,
    maxVisits,
    currentMonthName,
    countConsultation,
    countVaccine,
    countGrooming,
    countInpatient,
    countRegistrationOnly,
    totalServiceActivities,
    pctConsultation,
    pctVaccine,
    pctGrooming,
    pctInpatient,
    pctRegistrationOnly,
  } = useMemo(() => {
    // Tanggal yang sudah lewat HANYA menjadi riwayat panel, TIDAK DIHITUNG sebagai pengunjung antre hari ini
    const todayList = queues.filter((q) => isToday(q.createdAt));
    const active = queues.filter((q) => q.status === 'Menunggu' && isToday(q.createdAt));
    const inPoli = queues.filter((q) => q.status === 'Di Ruang Poli' && isToday(q.createdAt));
    const completed = queues.filter((q) => q.status === 'Selesai' && isToday(q.createdAt));
    const occCages = cages.filter((c) => c.status === 'Occupied').length;

    const baseQueueList = queueDateScope === 'today' ? todayList : queues;
    const displayed = baseQueueList.filter((q) => {
      if (queueFilter === 'all') return true;
      return q.status === queueFilter;
    });

    const trend = [
      { day: 'Sen', visits: 0, rev: 0 },
      { day: 'Sel', visits: 0, rev: 0 },
      { day: 'Rab', visits: 0, rev: 0 },
      { day: 'Kam', visits: 0, rev: 0 },
      { day: 'Jum', visits: 0, rev: 0 },
      { day: 'Sab', visits: 0, rev: 0 },
      { day: 'Hari Ini', visits: queues.length, rev: soapRecords.reduce((acc, curr) => acc + (curr.serviceFee || 0), 0) },
    ];
    const maxV = Math.max(1, ...trend.map((d) => d.visits));

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const monthName = currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

    const isDateInCurrentMonth = (dateStr?: string): boolean => {
      if (!dateStr) return false;
      if (dateStr.includes('WIB') && !dateStr.includes('-') && !dateStr.includes('/')) return true;
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
      const match = dateStr.match(/(\d{4})-(\d{2})/);
      if (match) {
        return parseInt(match[1], 10) === currentYear && parseInt(match[2], 10) - 1 === currentMonth;
      }
      return true;
    };

    const mQueues = queues.filter((q) => isDateInCurrentMonth(q.createdAt));
    const mSoaps = soapRecords.filter((s) => isDateInCurrentMonth(s.date));
    const mBookings = bookings.filter((b) => isDateInCurrentMonth(b.date));

    const cCons =
      mQueues.filter((q) => q.serviceType === 'Consultation').length +
      mSoaps.filter((s) => !s.queueId).length +
      mBookings.filter((b) => b.serviceType === 'Consultation' && b.status === 'Selesai').length;

    const cVac =
      mQueues.filter((q) => q.serviceType === 'Vaccine').length +
      mBookings.filter((b) => b.serviceType === 'Vaccine' && b.status === 'Selesai').length;

    const cGro =
      mQueues.filter((q) => q.serviceType === 'Grooming').length +
      mBookings.filter((b) => b.serviceType === 'Grooming' && b.status === 'Selesai').length;

    const inpatientFromCages = cages.filter((c) => c.status === 'Occupied' || (c.admittedAt && isDateInCurrentMonth(c.admittedAt))).length;
    const cInp =
      mQueues.filter((q) => q.serviceType === 'Hotel').length +
      inpatientFromCages +
      mBookings.filter((b) => b.serviceType === 'Hotel' && b.status === 'Selesai').length;

    const cReg = mQueues.filter((q) => q.serviceType === 'Daftar').length;

    const totalAct = cCons + cVac + cGro + cInp + cReg;

    return {
      todayQueues: todayList,
      activeQueues: active,
      inPoliQueues: inPoli,
      completedQueues: completed,
      occupiedCages: occCages,
      displayedQueues: displayed,
      visitTrendData: trend,
      maxVisits: maxV,
      currentMonthName: monthName,
      countConsultation: cCons,
      countVaccine: cVac,
      countGrooming: cGro,
      countInpatient: cInp,
      countRegistrationOnly: cReg,
      totalServiceActivities: totalAct,
      pctConsultation: totalAct > 0 ? Math.round((cCons / totalAct) * 100) : 0,
      pctVaccine: totalAct > 0 ? Math.round((cVac / totalAct) * 100) : 0,
      pctGrooming: totalAct > 0 ? Math.round((cGro / totalAct) * 100) : 0,
      pctInpatient: totalAct > 0 ? Math.round((cInp / totalAct) * 100) : 0,
      pctRegistrationOnly: totalAct > 0 ? Math.round((cReg / totalAct) * 100) : 0,
    };
  }, [queues, cages, soapRecords, bookings, queueFilter, queueDateScope]);

  // Memorized revenue estimation filtered by Date and Month/Year
  const { totalRevenueSum, totalRevenueSellsCount, averageRevenuePerSell } = useMemo(() => {
    let list = soapRecords;

    // Filter by Month & Year if not "all"
    if (revenueMonthFilter !== 'all') {
      const targetMonth = parseInt(revenueMonthFilter, 10);
      const targetYear = parseInt(revenueYearFilter, 10);
      list = list.filter((r) => {
        const d = new Date(r.date);
        return !isNaN(d.getTime()) && d.getMonth() === targetMonth && d.getFullYear() === targetYear;
      });
    } else {
      const targetYear = parseInt(revenueYearFilter, 10);
      list = list.filter((r) => {
        const d = new Date(r.date);
        return !isNaN(d.getTime()) && d.getFullYear() === targetYear;
      });
    }

    // Filter by Specific Date if set
    if (revenueSpecificDate) {
      list = list.filter((r) => {
        const d = new Date(r.date);
        if (isNaN(d.getTime())) return false;
        const recordDateStr = d.toISOString().split('T')[0];
        return recordDateStr === revenueSpecificDate;
      });
    }

    const sum = list.reduce((acc, curr) => acc + (curr.serviceFee || 0), 0);
    const count = list.length;
    const avg = count > 0 ? Math.round(sum / count) : 0;

    return {
      totalRevenueSum: sum,
      totalRevenueSellsCount: count,
      averageRevenuePerSell: avg,
    };
  }, [soapRecords, revenueMonthFilter, revenueYearFilter, revenueSpecificDate]);

  const handleCallPoli = (queue: VisitQueue) => {
    callQueue(queue.id, `Poli 1 (${currentUser?.name || 'drh. Sarah'})`);
  };

  const handleOpenSoap = (queue: VisitQueue) => {
    if (onSelectPatientForSoap) {
      onSelectPatientForSoap(queue);
    }
    navigate('/admin/rekam-medis');
  };

  return (
    <div className="space-y-6">
      {/* Top Welcome / Header info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-neutral-200/80">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight flex items-center gap-2">
            <span>Ringkasan Operasional Hari Ini</span>
            <span className="text-xs font-mono font-semibold bg-fuchsia-100 text-fuchsia-800 px-2.5 py-0.5 rounded-full border border-fuchsia-200">
              Live Real-Time
            </span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Pusat pemantauan klinik hewan
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500 font-medium">Poli Sedang Melayani:</span>
          <span className="text-sm font-mono font-black text-fuchsia-800 bg-white px-3 py-1.5 rounded-xl border border-neutral-200 shadow-xs">
            {currentServingTicket || 'Belum Ada'}
          </span>
        </div>
      </div>

      {/* 3 KPI METRIC CARDS */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        {/* Total Visits Today */}
        <div className="p-3 sm:p-4 md:p-5 rounded-xl sm:rounded-2xl bg-white border border-neutral-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-xs font-semibold text-neutral-500 truncate">Total Kunjungan</span>
            <div className="w-7 h-7 sm:w-9 h-9 rounded-lg sm:rounded-xl bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100 flex items-center justify-center shrink-0">
              <Users className="w-3.5 h-3.5 sm:w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            <p className="text-lg sm:text-2xl font-black text-neutral-900 font-mono">{todayQueues.length}</p>
            <p className="text-[10px] sm:text-[11px] text-fuchsia-700 flex items-center gap-0.5 sm:gap-1 mt-0.5 font-medium truncate">
              <TrendingUp className="w-3 h-3 shrink-0" />
              <span className="truncate">Hari ini ({queues.length})</span>
            </p>
          </div>
        </div>

        {/* Current Active Queues */}
        <div className="p-3 sm:p-4 md:p-5 rounded-xl sm:rounded-2xl bg-white border border-neutral-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-xs font-semibold text-neutral-500 truncate">Antrean Poli</span>
            <div className="w-7 h-7 sm:w-9 h-9 rounded-lg sm:rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
              <Clock className="w-3.5 h-3.5 sm:w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            <div className="flex items-baseline gap-1 sm:gap-2 flex-wrap">
              <p className="text-lg sm:text-2xl font-black text-amber-600 font-mono">{activeQueues.length}</p>
              <span className="text-[10px] sm:text-xs text-neutral-500 truncate">antre</span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-neutral-500 mt-0.5 truncate">
              Est. ~{activeQueues.length * 12}m
            </p>
          </div>
        </div>

        {/* Inpatient Occupancy */}
        <div className="p-3 sm:p-4 md:p-5 rounded-xl sm:rounded-2xl bg-white border border-neutral-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] sm:text-xs font-semibold text-neutral-500 truncate">Rawat Inap</span>
            <div className="w-7 h-7 sm:w-9 h-9 rounded-lg sm:rounded-xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shrink-0">
              <Hotel className="w-3.5 h-3.5 sm:w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            <div className="flex items-baseline gap-1 sm:gap-2">
              <p className="text-lg sm:text-2xl font-black text-sky-600 font-mono">{occupiedCages}/{cages.length}</p>
              <span className="text-[10px] sm:text-xs text-neutral-500 truncate">kdng</span>
            </div>
            <div className="w-full bg-neutral-100 h-1.5 sm:h-2 rounded-full mt-1.5 sm:mt-2 overflow-hidden">
              <div
                className="bg-sky-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${(occupiedCages / cages.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* LIVE UPDATING QUEUE TABLE */}
      <div id="admin-live-queue-table" className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-600 animate-pulse" />
              <span>Tabel Antrean Pasien Live (Poli Dokter)</span>
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Pasien yang mendaftar via portal pasien mandiri langsung muncul di tabel ini.
            </p>
          </div>

          {/* Date Scope & Status Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-neutral-100 p-1 rounded-xl border border-neutral-200/80">
              <button
                onClick={() => setQueueDateScope('today')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  queueDateScope === 'today'
                    ? 'bg-fuchsia-700 text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Hari Ini ({todayQueues.length})
              </button>
              <button
                onClick={() => setQueueDateScope('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  queueDateScope === 'all'
                    ? 'bg-fuchsia-700 text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Semua Tanggal ({queues.length})
              </button>
            </div>

            <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl border border-neutral-200/80">
              {(
                [
                  { id: 'all', label: `Semua Status` },
                  { id: 'Menunggu', label: `Menunggu (${activeQueues.length})` },
                  { id: 'Di Ruang Poli', label: `Di Poli (${inPoliQueues.length})` },
                  { id: 'Selesai', label: `Selesai (${completedQueues.length})` },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setQueueFilter(f.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    queueFilter === f.id
                      ? 'bg-white text-fuchsia-900 font-bold shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Dense Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-700">
            <thead className="bg-neutral-50/80 text-neutral-500 font-mono text-[11px] uppercase tracking-wider border-b border-neutral-200/80">
              <tr>
                <th className="px-4 py-3">Tiket</th>
                <th className="px-4 py-3">Pasien / Pemilik</th>
                <th className="px-4 py-3">Spesies & Ras</th>
                <th className="px-4 py-3">Layanan & Keluhan</th>
                <th className="px-4 py-3">Waktu Masuk</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {displayedQueues.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                    Tidak ada antrean dalam kategori ini.
                  </td>
                </tr>
              ) : (
                displayedQueues.map((q) => {
                  const isCurrent = q.status === 'Di Ruang Poli';

                  return (
                    <tr
                      key={q.id}
                      className={`hover:bg-neutral-50/80 transition ${
                        isCurrent ? 'bg-fuchsia-50/50 border-l-2 border-l-fuchsia-600' : ''
                      }`}
                    >
                      {/* Ticket */}
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-sm text-fuchsia-900 bg-fuchsia-50 px-2.5 py-1 rounded-lg border border-fuchsia-200 shadow-2xs">
                          {q.ticketNumber}
                        </span>
                      </td>

                      {/* Pet & Owner */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-neutral-900 flex items-center gap-1.5">
                          <span>{q.petName}</span>
                          {isCurrent && <span className="text-[10px] bg-fuchsia-100 text-fuchsia-800 font-semibold px-1.5 rounded-sm">SEDANG DIPERIKSA</span>}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          {q.ownerName} <span className="text-neutral-400 font-mono">({q.ownerWhatsapp})</span>
                        </div>
                      </td>

                      {/* Species */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">
                            {q.petType === 'Cat' ? '🐱' : q.petType === 'Dog' ? '🐶' : q.petType === 'Rabbit' ? '🐰' : '🦜'}
                          </span>
                          <span className="font-medium text-neutral-800">{q.petType}</span>
                        </div>
                      </td>

                      {/* Service & Complaint */}
                      <td className="px-4 py-3 max-w-xs">
                        <span className="inline-block text-[10px] font-semibold bg-neutral-100 border border-neutral-200 text-neutral-700 px-2 py-0.5 rounded-md mb-1">
                          {q.serviceType}
                        </span>
                        <p className="text-[11px] text-neutral-600 truncate" title={q.chiefComplaint}>
                          {q.chiefComplaint}
                        </p>
                      </td>

                      {/* Time */}
                      <td className="px-4 py-3 font-mono text-[11px] text-neutral-600 whitespace-nowrap">
                        <div>{formatTimeOnly(q.createdAt)}</div>
                        {!isToday(q.createdAt) && (
                          <span className="inline-block text-[9px] bg-neutral-200 text-neutral-700 px-1.5 py-0.5 rounded font-sans font-medium mt-0.5">
                            Tanggal Lalu
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            q.status === 'Di Ruang Poli'
                              ? 'bg-fuchsia-100 text-fuchsia-900 border border-fuchsia-300 animate-pulse'
                              : q.status === 'Selesai'
                              ? 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              q.status === 'Di Ruang Poli'
                                ? 'bg-fuchsia-600'
                                : q.status === 'Selesai'
                                ? 'bg-neutral-400'
                                : 'bg-amber-500'
                            }`}
                          />
                          {q.status}
                        </span>
                      </td>

                      {/* Action buttons */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* [ Panggil ke Poli ] */}
                          {q.status === 'Menunggu' && (
                            <button
                              id={`btn-call-queue-${q.ticketNumber}`}
                              onClick={() => handleCallPoli(q)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold text-xs shadow-xs transition"
                              title="Panggil pasien masuk ke poli"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                              <span>Panggil Poli</span>
                            </button>
                          )}

                          {/* [ Rekam Medis ] */}
                          <button
                            onClick={() => handleOpenSoap(q)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold border border-neutral-200 transition"
                            title="Tulis SOAP & Resep untuk pasien ini"
                          >
                            <FileText className="w-3.5 h-3.5 text-fuchsia-700" />
                            <span className="hidden sm:inline">SOAP</span>
                          </button>

                          {/* [ Selesai ] */}
                          {q.status === 'Di Ruang Poli' && (
                            <button
                              onClick={() => completeQueue(q.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-fuchsia-100 hover:bg-fuchsia-200 text-fuchsia-900 text-xs font-semibold border border-fuchsia-200 transition"
                              title="Tandai antrean selesai"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-fuchsia-700" />
                              <span>Selesai</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DYNAMIC CHARTS & VISIT TREND ANALYTICS */}
      <VisitTrendAnalytics />

      {/* PANEL ESTIMASI PENDAPATAN LAYANAN (DENGAN FILTER TANGGAL & BULAN) */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
          <div>
            <h3 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>Estimasi Pendapatan Layanan (SOAP)</span>
              {canViewRevenue(currentUser) ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                  <Crown className="w-3 h-3 text-amber-600" />
                  Super Admin
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
                  <Lock className="w-3 h-3 text-neutral-500" />
                  Akses Terbatas
                </span>
              )}
            </h3>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              {canViewRevenue(currentUser)
                ? 'Analisis pendapatan berdasarkan tarif service fee pemeriksaan rekam medis.'
                : 'Ringkasan jumlah tindakan medis klinik. Rekapitulasi omset dan nilai rupiah hanya dapat dilihat oleh Super Admin / Owner.'}
            </p>
          </div>

          {/* FILTER BULAN DAN TANGGAL (Hanya untuk Super Admin) */}
          {canViewRevenue(currentUser) && (
            <div className="flex flex-wrap items-center gap-3">
              {/* Filter Bulan */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-neutral-400 uppercase">Bulan:</span>
                <select
                  value={revenueMonthFilter}
                  onChange={(e) => setRevenueMonthFilter(e.target.value)}
                  className="bg-neutral-50 border border-neutral-300 text-neutral-800 text-xs font-bold rounded-lg px-2 py-1 focus:ring-1 focus:ring-fuchsia-500 cursor-pointer"
                >
                  <option value="all">Semua Bulan</option>
                  <option value="0">Januari</option>
                  <option value="1">Februari</option>
                  <option value="2">Maret</option>
                  <option value="3">April</option>
                  <option value="4">Mei</option>
                  <option value="5">Juni</option>
                  <option value="6">Juli</option>
                  <option value="7">Agustus</option>
                  <option value="8">September</option>
                  <option value="9">Oktober</option>
                  <option value="10">November</option>
                  <option value="11">Desember</option>
                </select>
              </div>

              {/* Filter Tanggal Spesifik */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-neutral-400 uppercase">Tanggal:</span>
                <input
                  type="date"
                  value={revenueSpecificDate}
                  onChange={(e) => setRevenueSpecificDate(e.target.value)}
                  className="bg-neutral-50 border border-neutral-300 text-neutral-800 text-xs font-bold rounded-lg px-2 py-0.5 focus:ring-1 focus:ring-fuchsia-500 cursor-pointer font-mono"
                />
                {revenueSpecificDate && (
                  <button
                    type="button"
                    onClick={() => setRevenueSpecificDate('')}
                    className="text-[10px] text-rose-600 hover:underline font-bold"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* REVENUE SUMMARY CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div className="bg-neutral-50/60 rounded-xl p-4 border border-neutral-200/50 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold block">Total Pemeriksaan SOAP</span>
              <span className="text-xl font-black text-neutral-800 font-mono mt-1 block">
                {totalRevenueSellsCount} <span className="text-xs font-sans text-neutral-500 font-normal">Sesi</span>
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-white border border-neutral-200 flex items-center justify-center text-fuchsia-700">
              <FileText className="w-4 h-4" />
            </div>
          </div>

          {canViewRevenue(currentUser) ? (
            <div className="bg-emerald-50/40 rounded-xl p-4 border border-emerald-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-emerald-600 font-bold block">Estimasi Pendapatan Layanan</span>
                <span className="text-xl font-black text-emerald-700 font-mono mt-1 block">
                  Rp {totalRevenueSum.toLocaleString('id-ID')}
                </span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-white border border-emerald-200 flex items-center justify-center text-emerald-700">
                <span className="text-xs font-bold">Rp</span>
              </div>
            </div>
          ) : (
            <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200 flex items-center justify-between">
              <div className="pr-2">
                <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold block">Estimasi Pendapatan Layanan</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <Lock className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="text-xs font-bold text-neutral-500">
                    Akses Khusus Superadmin / Owner
                  </span>
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-400">
                <Lock className="w-4 h-4" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
