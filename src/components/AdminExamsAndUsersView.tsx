import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, Plus, Save, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import {
  createExam,
  createUserAccount,
  deleteUserAccount,
  fetchUsers,
  updateExam,
  updateUserAccount,
} from '../lib/api';
import type { AnswerOption, AuthUser, SubjectExam } from '../types';
import { ConfirmModal } from './ConfirmModal';

interface AdminExamsAndUsersViewProps {
  currentUser: AuthUser;
  exams: SubjectExam[];
  selectedExamId: string;
  onSelectExamId: (examId: string) => void;
  onExamsChanged: () => void;
}

const OPTIONS: AnswerOption[] = ['a', 'b', 'c', 'd'];

export function AdminExamsAndUsersView({
  currentUser,
  exams,
  selectedExamId,
  onSelectExamId,
  onExamsChanged,
}: AdminExamsAndUsersViewProps) {
  const [subTab, setSubTab] = useState<'keys' | 'users'>('keys');

  // Exam Key Editor states
  const activeExam = useMemo(
    () => exams.find((e) => e.id === selectedExamId) ?? exams[0] ?? null,
    [exams, selectedExamId]
  );

  const [examName, setExamName] = useState('');
  const [questionCount, setQuestionCount] = useState(50);
  const [kkm, setKkm] = useState(75);
  const [pgWeight, setPgWeight] = useState(100);
  const [draftKey, setDraftKey] = useState<AnswerOption[]>([]);
  const [bulkKeyInput, setBulkKeyInput] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyMessage, setKeyMessage] = useState('');
  const [keyError, setKeyError] = useState('');

  // New subject modal/inline
  const [showNewSubject, setShowNewSubject] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');

  // Users Manager states
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [newRole, setNewRole] = useState<'guru' | 'admin'>('guru');
  const [userMessage, setUserMessage] = useState('');
  const [userError, setUserError] = useState('');
  const [userToDelete, setUserToDelete] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (activeExam) {
      setExamName(activeExam.name);
      setQuestionCount(activeExam.questionCount);
      setKkm(activeExam.kkm);
      setPgWeight(activeExam.pgWeight);
      setDraftKey(activeExam.answerKey);
      setBulkKeyInput(activeExam.answerKey.join('').toUpperCase());
      setKeyMessage('');
      setKeyError('');
    }
  }, [activeExam]);

  const loadUsersList = async () => {
    setUsersLoading(true);
    try {
      const list = await fetchUsers();
      setUsers(list);
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Gagal memuat daftar akun.');
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (subTab === 'users') {
      loadUsersList();
    }
  }, [subTab]);

  const handleBulkKeyApply = () => {
    const cleaned = bulkKeyInput
      .toLowerCase()
      .replace(/[^abcd]/g, '')
      .slice(0, questionCount);
    if (!cleaned) return;
    setDraftKey((prev) =>
      Array.from({ length: questionCount }, (_, idx) => {
        const ch = cleaned[idx];
        return ch === 'a' || ch === 'b' || ch === 'c' || ch === 'd'
          ? ch
          : prev[idx] ?? 'a';
      })
    );
  };

  const handleSaveExamConfig = async () => {
    if (!activeExam) return;
    setKeyBusy(true);
    setKeyError('');
    setKeyMessage('');
    try {
      const normalized = Array.from({ length: questionCount }, (_, i) => draftKey[i] ?? 'a');
      await updateExam(activeExam.id, {
        name: examName,
        questionCount,
        kkm,
        pgWeight,
        answerKey: normalized,
      });
      onExamsChanged();
      setKeyMessage(`Kunci jawaban dan pengaturan "${examName}" berhasil disimpan.`);
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Gagal menyimpan kunci jawaban.');
    } finally {
      setKeyBusy(false);
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setKeyBusy(true);
    setKeyError('');
    try {
      const created = await createExam({
        code: newCode,
        name: newSubjectName,
        questionCount: 50,
        kkm: 75,
        pgWeight: 100,
        answerKey: Array.from({ length: 50 }, () => 'a'),
      });
      setShowNewSubject(false);
      setNewCode('');
      setNewSubjectName('');
      onExamsChanged();
      onSelectExamId(created.id);
      setKeyMessage(`Mata pelajaran "${created.name}" berhasil ditambahkan.`);
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Gagal menambah mata pelajaran.');
    } finally {
      setKeyBusy(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError('');
    setUserMessage('');
    try {
      const created = await createUserAccount({
        username: newUsername,
        displayName: newDisplayName,
        passcode: newPasscode,
        role: newRole,
      });
      setNewUsername('');
      setNewDisplayName('');
      setNewPasscode('');
      setUserMessage(`Akun ${created.role.toUpperCase()} "${created.username}" berhasil dibuat.`);
      await loadUsersList();
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Gagal membuat akun.');
    }
  };

  const handleToggleUserActive = async (user: AuthUser) => {
    setUserError('');
    try {
      await updateUserAccount(user.id, { active: !user.active });
      await loadUsersList();
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Gagal mengubah status akun.');
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await deleteUserAccount(userToDelete.id);
      setUserMessage(`Akun "${userToDelete.username}" dihapus.`);
      setUserToDelete(null);
      await loadUsersList();
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Gagal menghapus akun.');
    }
  };

  const keyColumns = useMemo(() => {
    const cols: number[][] = [];
    for (let start = 0; start < questionCount; start += 10) {
      const end = Math.min(start + 10, questionCount);
      const list: number[] = [];
      for (let i = start; i < end; i++) list.push(i);
      cols.push(list);
    }
    return cols;
  }, [questionCount]);

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-lg bg-slate-200/70 p-1">
        <button
          type="button"
          onClick={() => setSubTab('keys')}
          className={`flex min-h-[38px] items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors whitespace-nowrap ${
            subTab === 'keys' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <KeyRound className="h-4 w-4" />
          Mata Pelajaran & Kunci Jawaban
        </button>
        <button
          type="button"
          onClick={() => setSubTab('users')}
          className={`flex min-h-[38px] items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors whitespace-nowrap ${
            subTab === 'users' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          Kelola Akun Guru & Admin
        </button>
      </div>

      {subTab === 'keys' ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Editor Kunci Jawaban & Bobot Ujian
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Atur kunci jawaban 1–50, nilai KKM, dan bobot PG/Essay per mata pelajaran.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewSubject((v) => !v)}
              className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              Tambah Mata Pelajaran
            </button>
          </div>

          {showNewSubject && (
            <form
              onSubmit={handleCreateSubject}
              className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Kode</label>
                <input
                  type="text"
                  required
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="BIO"
                  className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Nama Mata Pelajaran
                </label>
                <input
                  type="text"
                  required
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  placeholder="Contoh: Bahasa Daerah"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={keyBusy}
                className="min-h-[40px] rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                Simpan Mapel
              </button>
            </form>
          )}

          {keyMessage && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{keyMessage}</span>
            </div>
          )}
          {keyError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {keyError}
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Pilih Mata Pelajaran
              </label>
              <select
                value={activeExam?.id || ''}
                onChange={(e) => onSelectExamId(e.target.value)}
                className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
              >
                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.subjectNumber}. {exam.name} ({exam.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Jumlah Soal PG</label>
              <input
                type="number"
                min={5}
                max={50}
                value={questionCount}
                onChange={(e) => {
                  const val = Math.min(50, Math.max(5, Number(e.target.value) || 50));
                  setQuestionCount(val);
                  setDraftKey((prev) =>
                    Array.from({ length: val }, (_, idx) => prev[idx] ?? 'a')
                  );
                }}
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Nilai KKM</label>
              <input
                type="number"
                min={0}
                max={100}
                value={kkm}
                onChange={(e) => setKkm(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Bobot PG (%) · Essay ({100 - pgWeight}%)
              </label>
              <input
                type="number"
                min={10}
                max={100}
                value={pgWeight}
                onChange={(e) =>
                  setPgWeight(Math.min(100, Math.max(10, Number(e.target.value) || 100)))
                }
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
          </div>

          {/* Quick String Input */}
          <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex-1 min-w-[240px]">
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Isi Cepat Kunci Jawaban (Tempel huruf A/B/C/D berurutan)
              </label>
              <input
                type="text"
                value={bulkKeyInput}
                onChange={(e) => setBulkKeyInput(e.target.value)}
                placeholder="Contoh: ABCDABCD..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs uppercase tracking-wider"
              />
            </div>
            <button
              type="button"
              onClick={handleBulkKeyApply}
              className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap"
            >
              Terapkan ke Grid
            </button>
          </div>

          {/* 5-Column Key Editor */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {keyColumns.map((colIndices, colIdx) => (
              <div
                key={colIdx}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                {colIndices.map((qIdx) => (
                  <div
                    key={qIdx}
                    className="flex items-center justify-between border-b border-slate-100 px-2.5 py-1.5 last:border-b-0"
                  >
                    <span className="w-7 font-mono text-xs font-semibold text-slate-700 tabular-nums">
                      {qIdx + 1}.
                    </span>
                    <div className="flex items-center gap-1">
                      {OPTIONS.map((opt) => {
                        const selected = draftKey[qIdx] === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              setDraftKey((prev) => {
                                const next = [...prev];
                                next[qIdx] = opt;
                                return next;
                              })
                            }
                            className={`flex h-7 w-7 items-center justify-center rounded font-mono text-xs font-semibold uppercase ${
                              selected
                                ? 'bg-emerald-700 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={keyBusy}
              onClick={handleSaveExamConfig}
              className="flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {keyBusy ? 'Menyimpan...' : 'Simpan Kunci Jawaban'}
            </button>
          </div>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Create Guru/Admin Account */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4">
            <h2 className="text-base font-semibold text-slate-900">Buat Akun Baru</h2>
            <p className="mt-1 text-xs text-slate-500">
              Akun Guru hanya memiliki akses Scanner, pilih data siswa, Google Sheets, dan Export.
            </p>

            {userError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {userError}
              </div>
            )}
            {userMessage && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {userMessage}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Peran Akun</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'guru' | 'admin')}
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="guru">Guru (Scanner & Export saja)</option>
                  <option value="admin">Admin (Kelola penuh)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Username</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Contoh: guru_ipa"
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  required
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="Contoh: Ust. Ahmad S.Pd"
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Kata Sandi (min. 6 karakter)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPasscode}
                  onChange={(e) => setNewPasscode(e.target.value)}
                  placeholder="Masukkan kata sandi"
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                <UserPlus className="h-4 w-4" />
                Tambah Akun
              </button>
            </form>
          </section>

          {/* Users Table */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-8">
            <h2 className="text-base font-semibold text-slate-900">Daftar Akun Terdaftar</h2>
            <p className="mt-1 text-xs text-slate-500">
              Nonaktifkan atau hapus akun kapan saja jika guru sudah selesai bertugas.
            </p>

            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-3.5 py-3">Username</th>
                    <th className="px-3.5 py-3">Nama Lengkap</th>
                    <th className="px-3.5 py-3">Peran</th>
                    <th className="px-3.5 py-3">Status</th>
                    <th className="px-3.5 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usersLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                        Memuat daftar akun...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                        Belum ada akun tersimpan di database.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/70">
                        <td className="px-3.5 py-2.5 font-mono text-xs font-semibold text-slate-800">
                          {u.username}
                        </td>
                        <td className="px-3.5 py-2.5 font-medium text-slate-900">
                          {u.displayName}
                        </td>
                        <td className="px-3.5 py-2.5 text-xs font-medium uppercase text-slate-700">
                          {u.role}
                        </td>
                        <td className="px-3.5 py-2.5 text-xs">
                          <span className={u.active ? 'font-medium text-emerald-700' : 'text-slate-400'}>
                            {u.active ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleUserActive(u)}
                              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              {u.active ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                            {u.id !== currentUser.id && (
                              <button
                                type="button"
                                onClick={() => setUserToDelete(u)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                                aria-label={`Hapus ${u.username}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      <ConfirmModal
        open={Boolean(userToDelete)}
        title="Hapus Akun Pengguna?"
        description={`Hapus akun "${userToDelete?.username ?? ''}" (${userToDelete?.displayName ?? ''})?`}
        confirmLabel="Hapus Akun"
        destructive
        onConfirm={handleConfirmDeleteUser}
        onCancel={() => setUserToDelete(null)}
      />
    </div>
  );
}
