import { useState } from 'react';
import { Lock, ScanLine, ShieldCheck, UserCheck } from 'lucide-react';
import { loginAccount, setupInitialAdmin } from '../lib/api';
import type { AuthUser } from '../types';

interface AuthGateProps {
  needsSetup: boolean;
  hasEnvAdmin: boolean;
  onAuthenticated: (user: AuthUser) => void;
  onSetupComplete: () => void;
}

export function AuthGate({
  needsSetup,
  hasEnvAdmin,
  onAuthenticated,
  onSetupComplete,
}: AuthGateProps) {
  const [username, setUsername] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // First-run setup states
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminDisplayName, setAdminDisplayName] = useState('Administrator Sekolah');
  const [adminPasscode, setAdminPasscode] = useState('');
  const [createGuru, setCreateGuru] = useState(true);
  const [guruUsername, setGuruUsername] = useState('guru');
  const [guruDisplayName, setGuruDisplayName] = useState('Guru Penguji');
  const [guruPasscode, setGuruPasscode] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { user } = await loginAccount(username, passcode);
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk ke sistem.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { user } = await setupInitialAdmin({
        adminUsername,
        adminDisplayName,
        adminPasscode,
        createGuru,
        guruUsername: createGuru ? guruUsername : undefined,
        guruDisplayName: createGuru ? guruDisplayName : undefined,
        guruPasscode: createGuru ? guruPasscode : undefined,
      });
      onSetupComplete();
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan awal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid lg:grid-cols-12">
        {/* Left Academic Overview Column */}
        <div className="flex flex-col justify-between bg-slate-900 p-8 text-white lg:col-span-5">
          <div>
            <div className="flex items-center gap-2.5 text-emerald-400">
              <ScanLine className="h-6 w-6" />
              <span className="text-lg font-bold tracking-tight text-white">LJK Scan Pro</span>
            </div>
            <h1 className="mt-6 text-2xl font-bold leading-snug text-balance">
              Pemindai LJK Otomatis & Analisis Butir Soal
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Koreksi lembar jawaban pilihan ganda tanda silang (X) langsung dari kamera ponsel,
              rekap nilai ke Google Sheets, dan hitung kualitas butir soal secara akurat.
            </p>
          </div>

          <div className="mt-8 space-y-4 border-t border-slate-800 pt-6 text-sm">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <div>
                <p className="font-semibold text-white">Peran Admin</p>
                <p className="text-xs text-slate-400">
                  Mengelola data master siswa, mata pelajaran, kunci jawaban, dan akun guru.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <div>
                <p className="font-semibold text-white">Peran Guru</p>
                <p className="text-xs text-slate-400">
                  Memilih siswa, memindai LJK dengan kamera, menyinkronkan Google Sheets, dan
                  mengekspor laporan.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Auth Form Column */}
        <div className="p-8 lg:col-span-7">
          {needsSetup ? (
            <form onSubmit={handleSetup} className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Pengaturan Awal Akun Sekolah</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Buat kata sandi Admin untuk mengelola data siswa dan kunci jawaban. Anda juga dapat
                  langsung menyiapkan satu akun Guru.
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold tracking-wide text-slate-700">
                  01. Akun Pengelola (Admin)
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Username Admin
                    </label>
                    <input
                      type="text"
                      required
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Nama Tampilan
                    </label>
                    <input
                      type="text"
                      required
                      value={adminDisplayName}
                      onChange={(e) => setAdminDisplayName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Kata Sandi Admin (minimal 6 karakter)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={adminPasscode}
                    onChange={(e) => setAdminPasscode(e.target.value)}
                    placeholder="Masukkan kata sandi baru"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={createGuru}
                    onChange={(e) => setCreateGuru(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                  />
                  <span className="text-sm font-medium text-slate-800">
                    Sekaligus buat akun Guru untuk pemindaian
                  </span>
                </label>

                {createGuru && (
                  <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700">
                          Username Guru
                        </label>
                        <input
                          type="text"
                          required={createGuru}
                          value={guruUsername}
                          onChange={(e) => setGuruUsername(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-700">
                          Nama Guru
                        </label>
                        <input
                          type="text"
                          required={createGuru}
                          value={guruDisplayName}
                          onChange={(e) => setGuruDisplayName(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">
                        Kata Sandi Guru (minimal 6 karakter)
                      </label>
                      <input
                        type="password"
                        required={createGuru}
                        minLength={6}
                        value={guruPasscode}
                        onChange={(e) => setGuruPasscode(e.target.value)}
                        placeholder="Masukkan kata sandi akun Guru"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                <Lock className="h-4 w-4" />
                {loading ? 'Menyimpan...' : 'Simpan & Masuk sebagai Admin'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Masuk ke LJK Scan Pro</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Gunakan akun Admin atau akun Guru yang telah dibuat oleh Admin sekolah.
                </p>
              </div>

              {hasEnvAdmin && (
                <p className="text-xs text-slate-500">
                  Catatan: Pengelola dapat masuk menggunakan username <span className="font-mono font-semibold">admin</span> dan kata sandi dari pengaturan server.
                </p>
              )}

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Username
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Contoh: admin atau guru"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Kata Sandi
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Masukkan kata sandi"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                <Lock className="h-4 w-4" />
                {loading ? 'Memverifikasi...' : 'Masuk'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
