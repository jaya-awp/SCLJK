import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  CloudUpload,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Link2,
  Plus,
  Printer,
  Search,
  Trash2,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { deleteScanRecord, markScansSynced, updateSheetsConfig } from '../lib/api';
import { exportRecapCsv } from '../lib/csvExport';
import { googleSignInForSheets, googleSignOut } from '../lib/googleAuth';
import {
  createLjkSpreadsheet,
  extractSpreadsheetId,
  getSpreadsheetMetadata,
  syncLjkDataToGoogleSheets,
} from '../lib/googleSheets';
import { computeItemAnalysis } from '../lib/itemAnalysis';
import type { AuthUser, ScanRecord, SheetsConfig, Student, SubjectExam } from '../types';
import { ConfirmModal } from './ConfirmModal';

interface RecapViewProps {
  currentUser: AuthUser;
  exams: SubjectExam[];
  students: Student[];
  scans: ScanRecord[];
  selectedExamId: string;
  onSelectExamId: (examId: string) => void;
  sheetsConfig: SheetsConfig;
  onSheetsConfigUpdated: (config: SheetsConfig) => void;
  googleToken: string | null;
  googleUserEmail: string | null;
  onGoogleAuthChanged: (token: string | null, email: string | null) => void;
  onScansChanged: () => void;
}

export function RecapView({
  currentUser,
  exams,
  students,
  scans,
  selectedExamId,
  onSelectExamId,
  sheetsConfig,
  onSheetsConfigUpdated,
  googleToken,
  googleUserEmail,
  onGoogleAuthChanged,
  onScansChanged,
}: RecapViewProps) {
  const [gradeFilter, setGradeFilter] = useState<'all' | '7' | '8' | '9'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newSheetTitle, setNewSheetTitle] = useState('Database Nilai LJK ASSAS 2026/2027');
  const [linkSheetInput, setLinkSheetInput] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);

  const [sheetsBusy, setSheetsBusy] = useState(false);
  const [sheetsMessage, setSheetsMessage] = useState('');
  const [sheetsError, setSheetsError] = useState('');
  const [confirmSyncOpen, setConfirmSyncOpen] = useState(false);
  const [scanToDelete, setScanToDelete] = useState<ScanRecord | null>(null);

  const activeExam = useMemo(
    () => exams.find((e) => e.id === selectedExamId) ?? exams[0] ?? null,
    [exams, selectedExamId]
  );

  const examScans = useMemo(() => {
    if (!activeExam) return [];
    const q = searchQuery.trim().toLowerCase();
    return scans.filter((s) => {
      if (s.examId !== activeExam.id) return false;
      if (gradeFilter !== 'all' && s.studentGrade !== gradeFilter) return false;
      if (!q) return true;
      return (
        s.studentName.toLowerCase().includes(q) ||
        s.studentExamNumber.toLowerCase().includes(q) ||
        s.studentClassName.toLowerCase().includes(q)
      );
    });
  }, [scans, activeExam, gradeFilter, searchQuery]);

  const allExamScans = useMemo(
    () => (activeExam ? scans.filter((s) => s.examId === activeExam.id) : []),
    [scans, activeExam]
  );

  const { rows: analysisRows, stats } = useMemo(() => {
    if (!activeExam) {
      return {
        rows: [],
        stats: {
          totalStudents: 0,
          mean: 0,
          median: 0,
          highest: 0,
          lowest: 0,
          stdDev: 0,
          passCount: 0,
          passRate: 0,
          kr20Reliability: null,
        },
      };
    }
    return computeItemAnalysis(activeExam, allExamScans);
  }, [activeExam, allExamScans]);

  const handleGoogleLogin = async () => {
    setSheetsError('');
    setSheetsBusy(true);
    try {
      const { user, accessToken } = await googleSignInForSheets();
      onGoogleAuthChanged(accessToken, user.email ?? 'Akun Google');
      setSheetsMessage('Akun Google terhubung. Anda siap membuat atau menyinkronkan Google Sheets.');
    } catch (err) {
      setSheetsError(err instanceof Error ? err.message : 'Gagal menghubungkan akun Google.');
    } finally {
      setSheetsBusy(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    await googleSignOut();
    onGoogleAuthChanged(null, null);
    setSheetsMessage('');
  };

  const handleCreateSpreadsheet = async () => {
    if (!googleToken) return;
    setSheetsError('');
    setSheetsBusy(true);
    try {
      const created = await createLjkSpreadsheet(googleToken, newSheetTitle);
      const updated = await updateSheetsConfig({
        spreadsheetId: created.spreadsheetId,
        spreadsheetTitle: created.title,
        spreadsheetUrl: created.spreadsheetUrl,
      });
      onSheetsConfigUpdated(updated);
      setSheetsMessage(`Spreadsheet "${created.title}" berhasil dibuat dan ditautkan.`);
    } catch (err) {
      setSheetsError(err instanceof Error ? err.message : 'Gagal membuat spreadsheet.');
    } finally {
      setSheetsBusy(false);
    }
  };

  const handleLinkExistingSpreadsheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleToken || !linkSheetInput.trim()) return;
    setSheetsError('');
    setSheetsBusy(true);
    try {
      const id = extractSpreadsheetId(linkSheetInput);
      const meta = await getSpreadsheetMetadata(googleToken, id);
      const updated = await updateSheetsConfig({
        spreadsheetId: meta.spreadsheetId,
        spreadsheetTitle: meta.title,
        spreadsheetUrl: meta.spreadsheetUrl,
      });
      onSheetsConfigUpdated(updated);
      setShowLinkInput(false);
      setLinkSheetInput('');
      setSheetsMessage(`Berhasil menautkan spreadsheet "${meta.title}".`);
    } catch (err) {
      setSheetsError(err instanceof Error ? err.message : 'Gagal menautkan spreadsheet.');
    } finally {
      setSheetsBusy(false);
    }
  };

  const executeSyncToSheets = async () => {
    if (!googleToken || !sheetsConfig.spreadsheetId || !activeExam) return;
    setSheetsError('');
    setSheetsBusy(true);
    try {
      const result = await syncLjkDataToGoogleSheets({
        accessToken: googleToken,
        spreadsheetId: sheetsConfig.spreadsheetId,
        exam: activeExam,
        students,
        scans: allExamScans,
        analysisRows,
        stats,
      });
      await markScansSynced(activeExam.id);
      const updatedCfg = await updateSheetsConfig({ synced: true });
      onSheetsConfigUpdated(updatedCfg);
      onScansChanged();
      setConfirmSyncOpen(false);
      setSheetsMessage(
        `${result.syncedRows} data nilai & ${analysisRows.length} butir analisis berhasil disinkronkan ke Google Sheets.`
      );
    } catch (err) {
      setSheetsError(
        err instanceof Error ? err.message : 'Gagal menyinkronkan data ke Google Sheets.'
      );
    } finally {
      setSheetsBusy(false);
    }
  };

  const handleDeleteScan = async () => {
    if (!scanToDelete) return;
    try {
      await deleteScanRecord(scanToDelete.id);
      setScanToDelete(null);
      onScansChanged();
    } catch (err) {
      setSheetsError(err instanceof Error ? err.message : 'Gagal menghapus data scan.');
    }
  };

  return (
    <div className="space-y-6 print-full">
      {/* Google Sheets Database Integration Card */}
      <section className="no-print rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Database Google Sheets (Rekapitulasi & Analisis)
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Hubungkan akun Google untuk menyimpan rekap nilai siswa dan tabel analisis butir soal
                langsung ke Google Sheets.
              </p>
            </div>
          </div>

          {!googleToken ? (
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={sheetsBusy}
              className="flex min-h-[42px] items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-xs hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
              Sign in with Google
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
                <UserCheck className="h-4 w-4 text-emerald-600" />
                {googleUserEmail}
              </span>
              <button
                type="button"
                onClick={handleGoogleDisconnect}
                className="text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline"
              >
                Putuskan
              </button>
            </div>
          )}
        </div>

        {sheetsError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {sheetsError}
          </div>
        )}
        {sheetsMessage && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
            {sheetsMessage}
          </div>
        )}

        {googleToken && (
          <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
            {sheetsConfig.spreadsheetId ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="text-sm">
                  <p className="font-semibold text-slate-900">
                    {sheetsConfig.spreadsheetTitle || 'Spreadsheet Terhubung'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    ID: <span className="font-mono">{sheetsConfig.spreadsheetId}</span>
                    {sheetsConfig.lastSyncedAt && (
                      <>
                        {' · '}Sinkron terakhir:{' '}
                        {new Date(sheetsConfig.lastSyncedAt).toLocaleString('id-ID')}
                      </>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {sheetsConfig.spreadsheetUrl && (
                    <a
                      href={sheetsConfig.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Buka Google Sheets
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowLinkInput((v) => !v)}
                    className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Ganti Spreadsheet
                  </button>
                  <button
                    type="button"
                    disabled={sheetsBusy || allExamScans.length === 0}
                    onClick={() => setConfirmSyncOpen(true)}
                    className="flex min-h-[40px] items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <CloudUpload className="h-4 w-4" />
                    Sinkronkan ke Google Sheets ({allExamScans.length})
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2.5">
                  <label className="block text-xs font-medium text-slate-700">
                    Buat Google Spreadsheet Baru Otomatis
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newSheetTitle}
                      onChange={(e) => setNewSheetTitle(e.target.value)}
                      className="min-h-[40px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={sheetsBusy}
                      onClick={handleCreateSpreadsheet}
                      className="flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                      Buat Sheet
                    </button>
                  </div>
                </div>

                <form onSubmit={handleLinkExistingSpreadsheet} className="space-y-2.5">
                  <label className="block text-xs font-medium text-slate-700">
                    Atau Tautkan URL / ID Spreadsheet yang Sudah Ada
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={linkSheetInput}
                      onChange={(e) => setLinkSheetInput(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      className="min-h-[40px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={sheetsBusy || !linkSheetInput.trim()}
                      className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      <Link2 className="h-4 w-4" />
                      Tautkan
                    </button>
                  </div>
                </form>
              </div>
            )}

            {showLinkInput && sheetsConfig.spreadsheetId && (
              <form
                onSubmit={handleLinkExistingSpreadsheet}
                className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3"
              >
                <input
                  type="text"
                  value={linkSheetInput}
                  onChange={(e) => setLinkSheetInput(e.target.value)}
                  placeholder="Tempel URL atau ID Google Spreadsheet tujuan..."
                  className="min-h-[38px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-emerald-600 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sheetsBusy || !linkSheetInput.trim()}
                  className="min-h-[38px] rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  Simpan Tautan
                </button>
              </form>
            )}
          </div>
        )}
      </section>

      {/* Recap Table Card */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Rekapitulasi Nilai — {activeExam?.name ?? '-'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {stats.totalStudents} peserta dipindai · Rata-rata {stats.mean} · Ketuntasan{' '}
              {stats.passRate}% (KKM {activeExam?.kkm ?? 75})
            </p>
          </div>

          <div className="no-print flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!activeExam || examScans.length === 0}
              onClick={() => activeExam && exportRecapCsv(activeExam, examScans)}
              className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV Rekap Nilai
            </button>
            <button
              type="button"
              disabled={examScans.length === 0}
              onClick={() => window.print()}
              className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Printer className="h-3.5 w-3.5" />
              Cetak
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="no-print mt-4 flex flex-wrap items-center gap-3">
          <select
            value={activeExam?.id || ''}
            onChange={(e) => onSelectExamId(e.target.value)}
            className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
          >
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.subjectNumber}. {exam.name}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1">
            {(['all', '7', '8', '9'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGradeFilter(g)}
                className={`min-h-[32px] rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                  gradeFilter === g
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {g === 'all' ? 'Semua' : `Kelas ${g}`}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari siswa atau kelas..."
              className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>
        </div>

        {/* Data Table */}
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-3.5 py-3">No</th>
                <th className="px-3.5 py-3">No. Peserta</th>
                <th className="px-3.5 py-3">Nama Siswa</th>
                <th className="px-3.5 py-3">Kelas</th>
                <th className="px-3.5 py-3 text-right">Benar</th>
                <th className="px-3.5 py-3 text-right">Salah</th>
                <th className="px-3.5 py-3 text-right">Kosong</th>
                <th className="px-3.5 py-3 text-right">Nilai Akhir</th>
                <th className="px-3.5 py-3">Ketuntasan</th>
                <th className="px-3.5 py-3">Sheets</th>
                {currentUser.role === 'admin' && (
                  <th className="no-print px-3.5 py-3 text-right">Aksi</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {examScans.length === 0 ? (
                <tr>
                  <td
                    colSpan={currentUser.role === 'admin' ? 11 : 10}
                    className="px-4 py-10 text-center text-sm text-slate-500"
                  >
                    Belum ada hasil pemindaian untuk mata pelajaran ini. Gunakan tab Scanner untuk
                    memindai lembar LJK siswa.
                  </td>
                </tr>
              ) : (
                examScans.map((scan, idx) => (
                  <tr key={scan.id} className="hover:bg-slate-50/70">
                    <td className="px-3.5 py-2.5 font-mono text-xs text-slate-500 tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-xs text-slate-700 tabular-nums">
                      {scan.studentExamNumber}
                    </td>
                    <td className="px-3.5 py-2.5 font-medium text-slate-900">
                      {scan.studentName}
                    </td>
                    <td className="px-3.5 py-2.5 text-xs text-slate-600">
                      {scan.studentClassName} · {scan.studentRoom}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-emerald-700 tabular-nums">
                      {scan.correctCount}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-red-600 tabular-nums">
                      {scan.wrongCount}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-amber-600 tabular-nums">
                      {scan.blankCount}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-900 tabular-nums">
                      {scan.finalScore}
                    </td>
                    <td className="px-3.5 py-2.5 text-xs font-medium">
                      {scan.passed ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Tuntas
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <XCircle className="h-3.5 w-3.5" />
                          Remedial
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-xs">
                      {scan.syncedToSheets ? (
                        <span className="text-emerald-700 font-medium">Tersinkron</span>
                      ) : (
                        <span className="text-slate-400">Belum</span>
                      )}
                    </td>
                    {currentUser.role === 'admin' && (
                      <td className="no-print px-3.5 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setScanToDelete(scan)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Hapus nilai ${scan.studentName}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmModal
        open={confirmSyncOpen}
        title="Sinkronkan Data ke Google Sheets?"
        description={`Aplikasi akan memperbarui tab "Rekap Nilai" (${allExamScans.length} siswa), "Analisis Butir Soal" (${analysisRows.length} soal), dan "Master Siswa" pada spreadsheet "${sheetsConfig.spreadsheetTitle}" untuk mata pelajaran ${activeExam?.name ?? ''}.`}
        confirmLabel="Ya, Sinkronkan Sekarang"
        busy={sheetsBusy}
        onConfirm={executeSyncToSheets}
        onCancel={() => setConfirmSyncOpen(false)}
      />

      <ConfirmModal
        open={Boolean(scanToDelete)}
        title="Hapus Data Hasil Scan?"
        description={`Hapus nilai ${scanToDelete?.studentName ?? ''} pada mata pelajaran ${scanToDelete?.examName ?? ''}? Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus Nilai"
        destructive
        onConfirm={handleDeleteScan}
        onCancel={() => setScanToDelete(null)}
      />
    </div>
  );
}
