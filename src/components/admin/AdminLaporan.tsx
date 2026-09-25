import React, { useState, useMemo } from 'react';
import {
  FileText,
  Star,
  Printer,
  Calendar,
  MessageSquare,
  ThumbsUp,
  Download,
  Filter,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  BarChart3,
  HeartHandshake,
  Activity,
  Smile,
  Meh,
  Frown,
  Sparkles,
} from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { AppRoute } from '../../navigation';
import { CustomerFeedback } from '../../types';
import { VisitTrendAnalytics } from '../analytics/VisitTrendAnalytics';

interface Props {
  navigate: (to: AppRoute) => void;
}

export const AdminLaporan: React.FC<Props> = ({ navigate }) => {
  const {
    feedbacks,
    deleteFeedback,
    queues,
    soapRecords,
    bookings,
    owners,
    pets,
  } = useClinic();

  // Current month/year filter for monthly report
  const now = new Date();
  const currentMonthValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthValue);

  // Tabs: 'tren-kunjungan' | 'saran-masukan' | 'laporan-bulanan'
  const [activeTab, setActiveTab] = useState<'tren-kunjungan' | 'saran-masukan' | 'laporan-bulanan'>('tren-kunjungan');

  // Search & filter for feedback
  const [feedbackSearch, setFeedbackSearch] = useState('');
  const [feedbackCategoryFilter, setFeedbackCategoryFilter] = useState('Semua');
  const [feedbackRatingFilter, setFeedbackRatingFilter] = useState<number | 'all'>('all');

  // Satisfaction Calculations
  const totalFeedbackCount = feedbacks.length;
  const avgSatisfaction = useMemo(() => {
    if (feedbacks.length === 0) return 0;
    const sum = feedbacks.reduce((acc, f) => acc + (f.satisfactionRating || 5), 0);
    return parseFloat((sum / feedbacks.length).toFixed(1));
  }, [feedbacks]);

  // Rating distribution
  const ratingDistribution = useMemo(() => {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    feedbacks.forEach((f) => {
      const r = Math.min(5, Math.max(1, Math.round(f.satisfactionRating || 5))) as 1 | 2 | 3 | 4 | 5;
      counts[r] = (counts[r] || 0) + 1;
    });
    return counts;
  }, [feedbacks]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    feedbacks.forEach((f) => {
      const cat = f.category || 'Umum';
      map[cat] = (map[cat] || 0) + 1;
    });
    return map;
  }, [feedbacks]);

  // Filtered feedbacks
  const filteredFeedbacks = useMemo(() => {
    return feedbacks.filter((f) => {
      const matchSearch =
        !feedbackSearch.trim() ||
        String(f.ownerName || '').toLowerCase().includes(feedbackSearch.toLowerCase()) ||
        String(f.petName || '').toLowerCase().includes(feedbackSearch.toLowerCase()) ||
        String(f.feedbackText || '').toLowerCase().includes(feedbackSearch.toLowerCase()) ||
        String(f.ticketNumber || '').toLowerCase().includes(feedbackSearch.toLowerCase());

      const matchCategory =
        feedbackCategoryFilter === 'Semua' || f.category === feedbackCategoryFilter;

      const matchRating =
        feedbackRatingFilter === 'all' || f.satisfactionRating === feedbackRatingFilter;

      return matchSearch && matchCategory && matchRating;
    });
  }, [feedbacks, feedbackSearch, feedbackCategoryFilter, feedbackRatingFilter]);

  // Monthly Report Calculations based on selectedMonth (YYYY-MM)
  const [selectedYearStr, selectedMonthStr] = selectedMonth.split('-');
  const selectedYearNum = parseInt(selectedYearStr, 10);
  const selectedMonthNum = parseInt(selectedMonthStr, 10);

  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const formattedMonthLabel = `${monthNames[selectedMonthNum - 1]} ${selectedYearNum}`;

  // Filter clinical data for the selected month
  const monthlyQueues = useMemo(() => {
    return queues.filter((q) => {
      if (!q.createdAt) return false;
      const d = new Date(q.createdAt);
      if (isNaN(d.getTime())) return false;
      return d.getFullYear() === selectedYearNum && d.getMonth() + 1 === selectedMonthNum;
    });
  }, [queues, selectedYearNum, selectedMonthNum]);

  const monthlyCompletedVisits = useMemo(() => {
    return monthlyQueues.filter((q) => q.status === 'Selesai');
  }, [monthlyQueues]);

  const monthlySoapRecords = useMemo(() => {
    return soapRecords.filter((s) => {
      if (!s.date) return false;
      const d = new Date(s.date);
      if (isNaN(d.getTime())) return false;
      return d.getFullYear() === selectedYearNum && d.getMonth() + 1 === selectedMonthNum;
    });
  }, [soapRecords, selectedYearNum, selectedMonthNum]);

  const monthlyBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (!b.date) return false;
      const d = new Date(b.date);
      if (isNaN(d.getTime())) return false;
      return d.getFullYear() === selectedYearNum && d.getMonth() + 1 === selectedMonthNum;
    });
  }, [bookings, selectedYearNum, selectedMonthNum]);

  const monthlyFeedbacks = useMemo(() => {
    return feedbacks.filter((f) => {
      if (!f.submittedAt) return false;
      // Format can be "DD/MM/YYYY HH:mm WIB" or ISO
      if (f.submittedAt.includes('/')) {
        const parts = f.submittedAt.split(' ')[0].split('/');
        if (parts.length >= 3) {
          const month = parseInt(parts[1], 10);
          const year = parseInt(parts[2], 10);
          return year === selectedYearNum && month === selectedMonthNum;
        }
      }
      const d = new Date(f.submittedAt);
      if (!isNaN(d.getTime())) {
        return d.getFullYear() === selectedYearNum && d.getMonth() + 1 === selectedMonthNum;
      }
      return true; // fallback
    });
  }, [feedbacks, selectedYearNum, selectedMonthNum]);

  const monthlyRevenue = useMemo(() => {
    return monthlySoapRecords.reduce((acc, s) => acc + (s.serviceFee || 0), 0);
  }, [monthlySoapRecords]);

  const monthlyAvgSatisfaction = useMemo(() => {
    if (monthlyFeedbacks.length === 0) return 0;
    const sum = monthlyFeedbacks.reduce((acc, f) => acc + (f.satisfactionRating || 5), 0);
    return parseFloat((sum / monthlyFeedbacks.length).toFixed(1));
  }, [monthlyFeedbacks]);

  // Service distribution in monthly report
  const monthlyServiceDistribution = useMemo(() => {
    const counts: Record<string, number> = {
      Consultation: 0,
      Vaccine: 0,
      Grooming: 0,
      Hotel: 0,
      Daftar: 0,
    };
    monthlyQueues.forEach((q) => {
      if (counts[q.serviceType] !== undefined) {
        counts[q.serviceType]++;
      } else {
        counts[q.serviceType] = 1;
      }
    });
    return counts;
  }, [monthlyQueues]);

  // Trigger browser print for Monthly Report
  const handlePrintReport = () => {
    window.print();
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-3.5 h-3.5 ${
              star <= Math.round(rating)
                ? 'fill-amber-400 text-amber-400'
                : 'text-neutral-200 fill-neutral-100'
            }`}
          />
        ))}
      </div>
    );
  };

  const getSatisfactionBadge = (rating: number) => {
    if (rating >= 4.5) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
          <Smile className="w-3 h-3 text-emerald-600" />
          Sangat Puas ({rating}/5)
        </span>
      );
    }
    if (rating >= 3.5) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
          <ThumbsUp className="w-3 h-3 text-blue-600" />
          Puas ({rating}/5)
        </span>
      );
    }
    if (rating >= 2.5) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
          <Meh className="w-3 h-3 text-amber-600" />
          Cukup ({rating}/5)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
        <Frown className="w-3 h-3 text-rose-600" />
        Kurang ({rating}/5)
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Tab Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-fuchsia-100 text-fuchsia-700">
              <FileText className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-neutral-900 tracking-tight">Laporan & Kepuasan Pelanggan</h2>
              <p className="text-xs text-neutral-500">
                Tinjau umpan balik pasien, tingkat kepuasan, dan rekapitulasi operasional bulanan klinik
              </p>
            </div>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2 p-1 bg-neutral-200/60 rounded-2xl w-fit">
          <button
            id="tab-tren-kunjungan"
            onClick={() => setActiveTab('tren-kunjungan')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'tren-kunjungan'
                ? 'bg-white text-fuchsia-800 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Grafik Tren Kunjungan</span>
          </button>

          <button
            id="tab-saran-masukan"
            onClick={() => setActiveTab('saran-masukan')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'saran-masukan'
                ? 'bg-white text-fuchsia-800 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Saran & Kepuasan</span>
            {feedbacks.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-fuchsia-100 text-fuchsia-700 font-mono">
                {feedbacks.length}
              </span>
            )}
          </button>

          <button
            id="tab-laporan-bulanan"
            onClick={() => setActiveTab('laporan-bulanan')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'laporan-bulanan'
                ? 'bg-white text-fuchsia-800 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Cetak Laporan Bulanan</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TAB 0: GRAFIK & ANALISIS TREN KUNJUNGAN PASIEN */}
      {/* ======================================================== */}
      {activeTab === 'tren-kunjungan' && (
        <div>
          <VisitTrendAnalytics />
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 1: SARAN & MASUKAN + AVERAGE KEPUASAN */}
      {/* ======================================================== */}
      {activeTab === 'saran-masukan' && (
        <div className="space-y-6">
          {/* Key Metrics Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Average Satisfaction Card */}
            <div className="bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  Rata-rata Kepuasan
                </span>
                <span className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                </span>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-neutral-900 font-mono">
                    {avgSatisfaction > 0 ? avgSatisfaction.toFixed(1) : '0.0'}
                  </span>
                  <span className="text-xs text-neutral-400 font-medium">/ 5.0</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  {renderStars(avgSatisfaction)}
                  <span className="text-[11px] text-neutral-500 font-medium">
                    {getSatisfactionBadge(avgSatisfaction)}
                  </span>
                </div>
              </div>
            </div>

            {/* Total Feedbacks Received */}
            <div className="bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  Total Masukan Masuk
                </span>
                <span className="p-2 rounded-xl bg-fuchsia-50 text-fuchsia-700">
                  <MessageSquare className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-neutral-900 font-mono">
                    {totalFeedbackCount}
                  </span>
                  <span className="text-xs text-neutral-400">tanggapan</span>
                </div>
                <p className="text-[11px] text-neutral-500 mt-2">
                  Dikumpulkan otomatis dari portal pasien pasca layanan
                </p>
              </div>
            </div>

            {/* Satisfaction Rate (% >= 4 Stars) */}
            <div className="bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  Indeks Kepuasan Positif
                </span>
                <span className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                  <HeartHandshake className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-emerald-700 font-mono">
                    {totalFeedbackCount > 0
                      ? `${Math.round(((ratingDistribution[5] + ratingDistribution[4]) / totalFeedbackCount) * 100)}%`
                      : '100%'}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 mt-2">
                  {ratingDistribution[5] + ratingDistribution[4]} dari {totalFeedbackCount} klien puas/sangat puas
                </p>
              </div>
            </div>

            {/* Monthly Report Quick Action Card */}
            <div className="bg-gradient-to-br from-fuchsia-700 to-fuchsia-900 text-white p-5 rounded-2xl shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-200">
                  Operasional Klinik
                </span>
                <h3 className="text-sm font-bold text-white mt-1">Laporan Bulanan Siap Cetak</h3>
                <p className="text-[11px] text-fuchsia-100/80 mt-1">
                  Cetak rekap kunjungan, omset, dan ulasan untuk arsip manajemen
                </p>
              </div>
              <button
                onClick={() => setActiveTab('laporan-bulanan')}
                className="mt-3 w-full py-2 px-3 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border border-white/20"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Buka Rekap Bulanan</span>
              </button>
            </div>
          </div>

          {/* Rating Breakdown & Analytics Bar */}
          <div className="bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-fuchsia-700" />
                <h3 className="text-sm font-bold text-neutral-900">Distribusi Rating Kepuasan Pelanggan</h3>
              </div>
              <span className="text-xs text-neutral-500">
                Berdasarkan {totalFeedbackCount} responden
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 pt-4">
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = ratingDistribution[stars as 1 | 2 | 3 | 4 | 5];
                const pct = totalFeedbackCount > 0 ? (count / totalFeedbackCount) * 100 : 0;
                return (
                  <button
                    key={stars}
                    onClick={() =>
                      setFeedbackRatingFilter(feedbackRatingFilter === stars ? 'all' : stars)
                    }
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      feedbackRatingFilter === stars
                        ? 'border-fuchsia-300 bg-fuchsia-50/70 ring-2 ring-fuchsia-700/20'
                        : 'border-neutral-100 hover:border-neutral-200 hover:bg-neutral-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-xs font-bold text-neutral-800">
                        <span>{stars}</span>
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      </div>
                      <span className="text-xs font-mono font-bold text-neutral-700">
                        {count} <span className="text-[10px] text-neutral-400 font-normal">({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-neutral-100 rounded-full mt-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          stars >= 4
                            ? 'bg-emerald-500'
                            : stars === 3
                            ? 'bg-amber-400'
                            : 'bg-rose-400'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Feedback Feed & Search Filter */}
          <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs overflow-hidden">
            {/* Header & Filter Controls */}
            <div className="p-4 sm:p-5 border-b border-neutral-200/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-fuchsia-700" />
                <h3 className="text-sm font-bold text-neutral-900">Daftar Saran, Kritik & Ulasan Masuk</h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">
                  {filteredFeedbacks.length} data
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Search Bar */}
                <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={feedbackSearch}
                    onChange={(e) => setFeedbackSearch(e.target.value)}
                    placeholder="Cari saran, nama klien, atau tiket..."
                    className="w-full pl-8 pr-3 py-1.5 bg-neutral-50 rounded-xl border border-neutral-200 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-fuchsia-700/20 transition"
                  />
                </div>

                {/* Category Filter */}
                <select
                  value={feedbackCategoryFilter}
                  onChange={(e) => setFeedbackCategoryFilter(e.target.value)}
                  className="px-3 py-1.5 bg-neutral-50 rounded-xl border border-neutral-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-fuchsia-700/20 cursor-pointer"
                >
                  <option value="Semua">Semua Kategori</option>
                  <option value="Pelayanan Dokter">Pelayanan Dokter</option>
                  <option value="Frontdesk & Antrean">Frontdesk & Antrean</option>
                  <option value="Grooming & Sanitasi">Grooming & Sanitasi</option>
                  <option value="Fasilitas & Ruangan">Fasilitas & Ruangan</option>
                  <option value="Obat & Farmasi">Obat & Farmasi</option>
                  <option value="Saran Umum">Saran Umum</option>
                </select>

                {/* Rating Filter */}
                <select
                  value={feedbackRatingFilter}
                  onChange={(e) =>
                    setFeedbackRatingFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                  }
                  className="px-3 py-1.5 bg-neutral-50 rounded-xl border border-neutral-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-fuchsia-700/20 cursor-pointer"
                >
                  <option value="all">Semua Bintang</option>
                  <option value="5">Bintang 5 ★★★★★</option>
                  <option value="4">Bintang 4 ★★★★☆</option>
                  <option value="3">Bintang 3 ★★★☆☆</option>
                  <option value="2">Bintang 2 ★★☆☆☆</option>
                  <option value="1">Bintang 1 ★☆☆☆☆</option>
                </select>
              </div>
            </div>

            {/* Feedback List Items */}
            {filteredFeedbacks.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-neutral-800">Belum Ada Saran atau Ulasan</h4>
                <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                  {feedbackSearch || feedbackCategoryFilter !== 'Semua' || feedbackRatingFilter !== 'all'
                    ? 'Tidak ditemukan masukan yang cocok dengan filter yang dipilih.'
                    : 'Masukan dan ulasan kepuasan dari klien yang mengisi formulir pasca pelayanan akan otomatis tampil di sini secara real-time.'}
                </p>
                {(feedbackSearch || feedbackCategoryFilter !== 'Semua' || feedbackRatingFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setFeedbackSearch('');
                      setFeedbackCategoryFilter('Semua');
                      setFeedbackRatingFilter('all');
                    }}
                    className="text-xs font-bold text-fuchsia-700 hover:underline cursor-pointer"
                  >
                    Reset Filter
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {filteredFeedbacks.map((item) => (
                  <div key={item.id} className="p-4 sm:p-5 hover:bg-neutral-50/50 transition flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {renderStars(item.satisfactionRating)}
                        <span className="text-xs font-bold text-neutral-900">{item.ownerName}</span>
                        {item.petName && (
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-600">
                            Pasien: <strong className="font-semibold text-neutral-800">{item.petName}</strong>
                          </span>
                        )}
                        {item.ticketNumber && (
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-fuchsia-50 text-fuchsia-800 font-bold border border-fuchsia-100">
                            #{item.ticketNumber}
                          </span>
                        )}
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 font-medium">
                          {item.category || 'Saran Umum'}
                        </span>
                        {getSatisfactionBadge(item.satisfactionRating)}
                      </div>

                      {/* Content Message */}
                      <p className="text-xs text-neutral-700 leading-relaxed bg-neutral-50 p-3 rounded-xl border border-neutral-100 italic">
                        "{item.feedbackText}"
                      </p>

                      <div className="flex items-center gap-3 text-[11px] text-neutral-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {item.submittedAt}
                        </span>
                        {item.ownerWhatsapp && (
                          <span>WA: {item.ownerWhatsapp}</span>
                        )}
                      </div>
                    </div>

                    {/* Action */}
                    <div className="shrink-0 flex items-center gap-1 self-end sm:self-center">
                      <button
                        onClick={() => {
                          if (confirm(`Hapus masukan dari ${item.ownerName}?`)) {
                            deleteFeedback(item.id);
                          }
                        }}
                        title="Hapus masukan ini"
                        className="p-2 rounded-xl text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: CETAK LAPORAN BULANAN */}
      {/* ======================================================== */}
      {activeTab === 'laporan-bulanan' && (
        <div className="space-y-6">
          {/* Action Bar (Hidden when printing) */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-neutral-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-fuchsia-50 text-fuchsia-700">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider block">
                  Pilih Periode Laporan Bulanan
                </label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="mt-1 px-3 py-1.5 rounded-xl border border-neutral-300 font-semibold text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-700/20 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrintReport}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-800 text-white text-xs font-bold shadow-xs transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak / Simpan PDF Laporan</span>
              </button>
            </div>
          </div>

          {/* Printable Report Document Sheet */}
          <div
            id="monthly-report-document"
            className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs p-6 sm:p-10 max-w-4xl mx-auto font-sans text-neutral-900 print:shadow-none print:border-none print:p-0 print:m-0"
          >
            {/* Klinik Official Header (KOP SURAT) */}
            <div className="border-b-2 border-neutral-900 pb-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-center sm:text-left">
                <div className="w-12 h-12 rounded-2xl bg-fuchsia-700 text-white flex items-center justify-center font-bold text-xl shadow-xs">
                  🐾
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight">myPet</h1>
                  <p className="text-xs text-neutral-600 font-medium">
                    Klinik Hewan, Pet Care & Grooming Terpadu
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    Jl. Kesehatan Hewan No. 8 • Telp/WA: 0812-3456-7890 • Sistem myPet
                  </p>
                </div>
              </div>
              <div className="text-center sm:text-right">
                <span className="inline-block text-[11px] font-bold font-mono uppercase bg-neutral-100 text-neutral-800 px-3 py-1 rounded-md mb-1">
                  LAPORAN BULANAN
                </span>
                <p className="text-sm font-extrabold text-fuchsia-800">
                  Periode: {formattedMonthLabel}
                </p>
                <p className="text-[10px] text-neutral-400 font-mono">
                  Dicetak pada: {new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}
                </p>
              </div>
            </div>

            {/* Monthly Summary Statistics Grid */}
            <div className="mb-6">
              <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
                I. Ringkasan Eksekutif Operasional
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/50">
                  <p className="text-[11px] text-neutral-500 font-medium">Total Kunjungan Pasien</p>
                  <p className="text-xl font-extrabold text-neutral-900 font-mono mt-1">
                    {monthlyQueues.length}
                  </p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">
                    {monthlyCompletedVisits.length} selesai ditangani
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/50">
                  <p className="text-[11px] text-neutral-500 font-medium">Rekam Medis (SOAP)</p>
                  <p className="text-xl font-extrabold text-neutral-900 font-mono mt-1">
                    {monthlySoapRecords.length}
                  </p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">catatan pemeriksaan dokter</p>
                </div>

                <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/50">
                  <p className="text-[11px] text-neutral-500 font-medium">Booking Terjadwal</p>
                  <p className="text-xl font-extrabold text-neutral-900 font-mono mt-1">
                    {monthlyBookings.length}
                  </p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">janji temu dibuat</p>
                </div>

                <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/50">
                  <p className="text-[11px] text-neutral-500 font-medium">Rata-rata Kepuasan Klien</p>
                  <p className="text-xl font-extrabold text-amber-600 font-mono mt-1 flex items-center gap-1">
                    {monthlyAvgSatisfaction > 0 ? monthlyAvgSatisfaction.toFixed(1) : '-'}
                    {monthlyAvgSatisfaction > 0 && <Star className="w-4 h-4 fill-amber-400 text-amber-400" />}
                  </p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">
                    {monthlyFeedbacks.length} responden bulan ini
                  </p>
                </div>
              </div>
            </div>

            {/* Service Type Breakdown Table */}
            <div className="mb-6">
              <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
                II. Distribusi Layanan Klinik ({formattedMonthLabel})
              </h3>
              <div className="border border-neutral-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-neutral-100 text-neutral-700 font-bold border-b border-neutral-200">
                    <tr>
                      <th className="p-2.5">Jenis Layanan</th>
                      <th className="p-2.5 text-center">Jumlah Pasien</th>
                      <th className="p-2.5 text-center">Proporsi</th>
                      <th className="p-2.5">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    <tr>
                      <td className="p-2.5 font-semibold text-neutral-800">Konsultasi / Poli Dokter Hewan</td>
                      <td className="p-2.5 text-center font-mono font-bold">{monthlyServiceDistribution.Consultation}</td>
                      <td className="p-2.5 text-center font-mono">
                        {monthlyQueues.length > 0
                          ? `${Math.round((monthlyServiceDistribution.Consultation / monthlyQueues.length) * 100)}%`
                          : '0%'}
                      </td>
                      <td className="p-2.5 text-neutral-500 text-[11px]">Pemeriksaan umum & diagnosa keluhan</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-semibold text-neutral-800">Vaksinasi & Imunisasi</td>
                      <td className="p-2.5 text-center font-mono font-bold">{monthlyServiceDistribution.Vaccine}</td>
                      <td className="p-2.5 text-center font-mono">
                        {monthlyQueues.length > 0
                          ? `${Math.round((monthlyServiceDistribution.Vaccine / monthlyQueues.length) * 100)}%`
                          : '0%'}
                      </td>
                      <td className="p-2.5 text-neutral-500 text-[11px]">Vaksin Rabies, Tricat, Tetracat, dsb</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-semibold text-neutral-800">Grooming & Salon Hewan</td>
                      <td className="p-2.5 text-center font-mono font-bold">{monthlyServiceDistribution.Grooming}</td>
                      <td className="p-2.5 text-center font-mono">
                        {monthlyQueues.length > 0
                          ? `${Math.round((monthlyServiceDistribution.Grooming / monthlyQueues.length) * 100)}%`
                          : '0%'}
                      </td>
                      <td className="p-2.5 text-neutral-500 text-[11px]">Mandi kutu, potong kuku, & perapian</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-semibold text-neutral-800">Penitipan Hewan (Pet Hotel)</td>
                      <td className="p-2.5 text-center font-mono font-bold">{monthlyServiceDistribution.Hotel}</td>
                      <td className="p-2.5 text-center font-mono">
                        {monthlyQueues.length > 0
                          ? `${Math.round((monthlyServiceDistribution.Hotel / monthlyQueues.length) * 100)}%`
                          : '0%'}
                      </td>
                      <td className="p-2.5 text-neutral-500 text-[11px]">Fasilitas kennel harian/mingguan</td>
                    </tr>
                  </tbody>
                  <tfoot className="bg-neutral-50 font-bold border-t border-neutral-200">
                    <tr>
                      <td className="p-2.5 text-neutral-900">Total Pasien Terlayani</td>
                      <td className="p-2.5 text-center font-mono text-fuchsia-800">{monthlyQueues.length}</td>
                      <td className="p-2.5 text-center font-mono">100%</td>
                      <td className="p-2.5 text-neutral-500 text-[11px]">-</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Customer Feedback and Satisfaction Summary in Monthly Report */}
            <div className="mb-6">
              <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
                III. Evaluasi Kepuasan & Rekapitulasi Ulasan Klien
              </h3>
              <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-200/80 pb-3">
                  <div>
                    <span className="text-xs font-bold text-neutral-800">
                      Rata-Rata Tingkat Kepuasan Pelanggan Periode Ini:
                    </span>
                    <span className="ml-2 text-sm font-extrabold text-amber-600 font-mono">
                      {monthlyAvgSatisfaction > 0 ? `${monthlyAvgSatisfaction.toFixed(1)} / 5.0` : 'Belum Ada Ulasan'}
                    </span>
                  </div>
                  <span className="text-xs text-neutral-500">
                    Total {monthlyFeedbacks.length} masukan tercatat
                  </span>
                </div>

                {monthlyFeedbacks.length === 0 ? (
                  <p className="text-xs text-neutral-500 italic py-2">
                    Tidak ada ulasan atau saran khusus yang masuk pada bulan ini.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                      Cuplikan Saran & Masukan Klien:
                    </p>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {monthlyFeedbacks.slice(0, 5).map((f) => (
                        <div key={f.id} className="text-xs bg-white p-2.5 rounded-lg border border-neutral-200 flex items-start gap-2">
                          <span className="text-amber-500 font-mono shrink-0">
                            ★ {f.satisfactionRating}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-neutral-900">{f.ownerName}: </span>
                            <span className="text-neutral-700 italic">"{f.feedbackText}"</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Financial Overview if SOAP Records have fees */}
            <div className="mb-8">
              <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">
                IV. Estimasi Transaksi Medis & Layanan
              </h3>
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-emerald-950">Total Nilai Tindakan & Layanan (SOAP)</p>
                  <p className="text-[11px] text-emerald-700">
                    Berdasarkan {monthlySoapRecords.length} tindakan rekam medis yang dicatat oleh dokter
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xl font-black text-emerald-800 font-mono">
                    Rp {monthlyRevenue.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>

            {/* Signature Block (Tanda Tangan Pengesahan) */}
            <div className="pt-6 border-t border-neutral-200 grid grid-cols-2 text-center text-xs">
              <div>
                <p className="text-neutral-500">Penanggung Jawab Administrasi,</p>
                <div className="h-16"></div>
                <p className="font-bold text-neutral-900 underline">Staff Frontdesk & Admin</p>
                <p className="text-[10px] text-neutral-400 font-mono">Vier Pet Care</p>
              </div>
              <div>
                <p className="text-neutral-500">Mengetahui & Menyetujui,</p>
                <div className="h-16"></div>
                <p className="font-bold text-neutral-900 underline">drh. Sarah Wijaya</p>
                <p className="text-[10px] text-neutral-400 font-mono">Kepala Dokter Hewan Klinik</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
