import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  PawPrint,
  FileText,
  Hotel,
  Package,
  Calendar,
  LogOut,
  Bell,
  Menu,
  X,
  ExternalLink,
  Shield,
  Stethoscope,
  RefreshCw,
  ClipboardList,
  Settings,
} from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { AppRoute } from '../../navigation';
import { isToday } from '../../utils/dateUtils';
import { getRoleBadgeInfo, canViewRevenue } from '../../utils/authUtils';

interface Props {
  currentRoute: AppRoute;
  navigate: (to: AppRoute) => void;
  children: React.ReactNode;
}

interface NavItem {
  id: string;
  route: AppRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
}

export const AdminLayout: React.FC<Props> = ({ currentRoute, navigate, children }) => {
  const {
    currentUser,
    logoutStaff,
    queues,
    inventory,
    cages,
    feedbacks,
    callNotification,
    dismissCallNotification,
    resetToInitialData,
    syncStatus,
    syncFromSpreadsheet,
    lastSyncMessage,
  } = useClinic();

  const [mobileOpen, setMobileOpen] = useState(false);

  const waitingCount = queues.filter((q) => q.status === 'Menunggu' && isToday(q.createdAt)).length;
  const criticalStockCount = inventory.filter((i) => i.stockQuantity <= i.minThreshold).length;
  const occupiedCagesCount = cages.filter((c) => c.status === 'Occupied').length;
  const feedbackCount = feedbacks.length;
  const isSuperAdmin = canViewRevenue(currentUser);

  const navItems: NavItem[] = [
    {
      id: 'dashboard',
      route: '/admin/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: waitingCount > 0 ? `${waitingCount}` : undefined,
    },
    {
      id: 'booking',
      route: '/admin/booking',
      label: 'Jadwal Booking',
      icon: Calendar,
    },
    {
      id: 'pemilik',
      route: '/admin/pemilik',
      label: 'Data Pemilik',
      icon: Users,
    },
    {
      id: 'pasien',
      route: '/admin/pasien',
      label: 'Data Pasien',
      icon: PawPrint,
    },
    {
      id: 'rekam-medis',
      route: '/admin/rekam-medis',
      label: 'Rekam Medis (SOAP)',
      icon: FileText,
    },
    {
      id: 'rawat-inap',
      route: '/admin/rawat-inap',
      label: 'Rawat Inap (Kennel)',
      icon: Hotel,
      badge: `${occupiedCagesCount}/${cages.length}`,
    },
    {
      id: 'stok',
      route: '/admin/stok',
      label: 'Stok Obat & BHP',
      icon: Package,
      badge: criticalStockCount > 0 ? `${criticalStockCount} Low` : undefined,
    },
    {
      id: 'laporan',
      route: '/admin/laporan',
      label: 'Laporan & Kepuasan',
      icon: ClipboardList,
      badge: feedbackCount > 0 ? `${feedbackCount}` : undefined,
    },
    ...(isSuperAdmin
      ? [
          {
            id: 'pengaturan',
            route: '/admin/pengaturan' as AppRoute,
            label: 'Pengaturan Admin',
            icon: Settings,
          },
        ]
      : []),
  ];

  const handleLogout = () => {
    logoutStaff();
    navigate('/login');
  };

  return (
    <div id="admin-root" className="min-h-screen bg-neutral-50 text-neutral-800 flex font-sans antialiased overflow-x-hidden">
      {/* Fixed Full-Height Navigation Sidebar with independent scroll */}
      <aside
        id="admin-fixed-sidebar"
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-neutral-200/80 flex flex-col justify-between transition-transform duration-200 ease-in-out overflow-y-auto max-h-screen shadow-xs ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div>
          {/* Clinic Brand & Role Badge */}
          <div className="h-16 px-5 border-b border-neutral-100 flex items-center justify-between sticky top-0 bg-white z-10">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-fuchsia-700 text-white flex items-center justify-center shrink-0 shadow-md shadow-fuchsia-700/25">
                <PawPrint className="w-6 h-6 fill-white/20 text-white stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <span className="font-extrabold text-base text-neutral-900 tracking-tight flex items-center gap-1">
                  myPet
                </span>
                <p className="text-[10px] text-neutral-500 leading-tight">Sistem Manajemen Klinik Hewan Terpadu</p>
              </div>
            </div>

            <button
              onClick={() => setMobileOpen(false)}
              className="lg:hidden text-neutral-400 hover:text-neutral-700 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Current Staff Profile Chip */}
          {(() => {
            const roleInfo = getRoleBadgeInfo(currentUser?.role);
            return (
              <div className="p-3 mx-3 mt-3 rounded-xl bg-neutral-50/90 border border-neutral-200/80 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white text-neutral-800 border border-neutral-200 flex items-center justify-center text-sm font-bold shrink-0 shadow-2xs">
                  {currentUser?.avatar || roleInfo.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-neutral-900 truncate">{currentUser?.name || 'Administrator'}</p>
                  <div className="flex items-center gap-1 text-[10px] mt-0.5">
                    <span className={`px-1.5 py-0.2 rounded font-semibold border ${roleInfo.badgeClass}`}>
                      {roleInfo.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Main Navigation Menu */}
          <nav className="p-3 space-y-1 mt-2">
            <p className="px-3 pb-1 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
              Menu Utama
            </p>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentRoute === item.route || (item.route === '/admin/dashboard' && currentRoute === '/admin');

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    navigate(item.route);
                    setMobileOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition group ${
                    isActive
                      ? 'bg-fuchsia-50 text-fuchsia-900 font-bold border border-fuchsia-200/80 shadow-xs'
                      : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={`w-4 h-4 transition ${
                        isActive ? 'text-fuchsia-700' : 'text-neutral-400 group-hover:text-neutral-600'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold font-mono ${
                        isActive
                          ? 'bg-fuchsia-200 text-fuchsia-900'
                          : item.badge.toString().includes('Low')
                          ? 'bg-rose-100 text-rose-700 border border-rose-200'
                          : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Actions */}
        <div className="p-3 border-t border-neutral-100 space-y-2">
          {/* Switch to Public Portal link */}
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 transition"
            title="Buka tampilan pendaftaran pasien"
          >
            <span className="flex items-center gap-2">
              <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
              <span>Portal Pasien</span>
            </span>
            <span className="text-[10px] bg-neutral-100 px-1.5 py-0.5 rounded-md text-neutral-600 font-mono">Public</span>
          </button>



          {/* Logout button */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar Akun</span>
          </button>
        </div>
      </aside>

      {/* Main Admin Workspace */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Top Header Bar */}
        <header className="h-16 bg-white/90 backdrop-blur-md border-b border-neutral-200/80 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden text-neutral-500 hover:text-neutral-900 p-1.5 rounded-lg hover:bg-neutral-100"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div>
              <h1 className="text-base sm:text-lg font-extrabold text-neutral-900 tracking-tight">
                myPet
              </h1>
              <p className="text-[11px] text-neutral-500">
                Sistem Manajemen Klinik Hewan Terpadu
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Live Queue Mini Badge */}
            <div className="hidden sm:flex items-center gap-2 bg-neutral-50 px-3 py-1.5 rounded-xl border border-neutral-200 text-xs">
              <span className="w-2 h-2 rounded-full bg-fuchsia-600 animate-pulse"></span>
              <span className="text-neutral-600 font-medium">Antrean Aktif:</span>
              <span className="font-mono font-bold text-fuchsia-700">{waitingCount}</span>
            </div>

            {/* Inpatient Occupancy Mini Badge */}
            <div className="hidden md:flex items-center gap-2 bg-neutral-50 px-3 py-1.5 rounded-xl border border-neutral-200 text-xs">
              <span className="text-neutral-600 font-medium">Rawat Inap:</span>
              <span className="font-mono font-bold text-fuchsia-700">{occupiedCagesCount} / {cages.length}</span>
            </div>

            {/* Automatic Backend Live Sync Indicator Badge */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs border select-none ${
                syncStatus === 'syncing'
                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                  : 'bg-fuchsia-50/90 text-fuchsia-900 border-fuchsia-200/80'
              }`}
              title={
                lastSyncMessage ||
                'Sinkronisasi otomatis berjalan di backend Node.js setiap saat tanpa perlu klik manual.'
              }
            >
              {syncStatus === 'syncing' ? (
                <RefreshCw className="w-3.5 h-3.5 text-amber-700 animate-spin" />
              ) : (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}
              <span className="hidden sm:inline">
                {syncStatus === 'syncing' ? 'Menyinkronkan Backend...' : 'Sinkron Otomatis (Backend)'}
              </span>
              <span className="sm:hidden font-mono text-[10px]">
                {syncStatus === 'syncing' ? 'Sync...' : 'Auto-Sync'}
              </span>
            </div>
          </div>
        </header>

        {/* Call Banner if recently called */}
        {callNotification && (
          <div className="bg-fuchsia-700 text-white px-4 py-2.5 text-xs flex items-center justify-between shadow-xs animate-in slide-in-from-top duration-200">
            <div className="flex items-center gap-2 font-medium">
              <Bell className="w-4 h-4 animate-bounce" />
              <span>
                Panggilan Terkirim: Tiket <strong>{callNotification.ticketNumber}</strong> ({callNotification.petName} - {callNotification.ownerName}) menuju <strong>{callNotification.room}</strong>.
              </span>
            </div>
            <button
              onClick={dismissCallNotification}
              className="text-fuchsia-100 hover:text-white text-xs font-bold px-2 py-0.5 hover:bg-fuchsia-800 rounded-md"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Dynamic Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-neutral-50">
          {children}
        </main>

        {/* Footer */}
        <footer className="w-full border-t border-neutral-200 bg-white py-6 text-center text-xs text-neutral-400">
          <div className="max-w-4xl mx-auto px-4 flex items-center justify-center">
            <p>© 2026 myPet - Sistem Manajemen Klinik Hewan Terpadu by RichOne Labs Studio</p>
          </div>
        </footer>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-neutral-950/60 z-30 lg:hidden backdrop-blur-xs"
        />
      )}
    </div>
  );
};
