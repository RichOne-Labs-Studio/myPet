import React, { useState } from 'react';
import { User, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { AppRoute } from '../../navigation';
import { VierLogo } from '../VierLogo';

interface Props {
  navigate: (to: AppRoute) => void;
  redirectTarget?: AppRoute;
}

export const LoginPage: React.FC<Props> = ({ navigate, redirectTarget }) => {
  const { loginStaff } = useClinic();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Username wajib diisi.');
      return;
    }

    if (!password.trim()) {
      setError('Kata sandi wajib diisi.');
      return;
    }

    const res = loginStaff(username, password);
    if (res.success) {
      navigate(redirectTarget || '/admin/dashboard');
    } else {
      setError(res.message);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden font-sans">
      {/* Background glow effects */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-fuchsia-200/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-fuchsia-100/40 rounded-full blur-3xl pointer-events-none" />

      {/* Back to public link */}
      <div className="w-full max-w-md mb-6 flex justify-start items-center z-10">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Portal Klien</span>
        </button>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md bg-white rounded-3xl border border-neutral-200/80 p-8 shadow-xl z-10">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mx-auto mb-4">
            <VierLogo className="h-16 w-auto" />
          </div>
          <h2 className="text-2xl font-black text-neutral-900 tracking-tight">myPet</h2>
          <p className="text-xs text-neutral-500 mt-1">
            Sistem Manajemen Klinik Hewan Terpadu
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium text-center">
            {error}
          </div>
        )}

        {/* Form Login */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              Username Staff / Dokter
            </label>
            <div className="relative">
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username"
                className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 placeholder-neutral-400 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 font-mono"
              />
              <User className="w-4 h-4 text-neutral-400 absolute right-3.5 top-3.5 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              Kata Sandi
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi"
                className="w-full pl-3.5 pr-11 py-2.5 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 placeholder-neutral-400 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 font-mono"
              />
              <button
                type="button"
                id="btn-toggle-password"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-3 text-neutral-400 hover:text-neutral-700 transition cursor-pointer p-0.5 rounded-md hover:bg-neutral-100"
                title={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            id="btn-submit-login"
            className="w-full py-3 px-4 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold text-sm shadow-md shadow-fuchsia-900/20 transition duration-150 transform active:scale-98 mt-2 cursor-pointer"
          >
            Masuk
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-neutral-100 text-center">
          <p className="text-[11px] text-neutral-400">
            Akses terbatas hanya untuk staf administrasi dan dokter hewan terdaftar Vier Pet Care.
          </p>
        </div>
      </div>
    </div>
  );
};
