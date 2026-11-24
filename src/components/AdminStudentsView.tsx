import { useMemo, useState } from 'react';
import { Edit3, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { bulkImportStudents, createStudent, deleteStudent, updateStudent } from '../lib/api';
import type { Student } from '../types';
import { ConfirmModal } from './ConfirmModal';

interface AdminStudentsViewProps {
  students: Student[];
  onStudentsChanged: () => void;
}

export function AdminStudentsView({ students, onStudentsChanged }: AdminStudentsViewProps) {
  const [gradeFilter, setGradeFilter] = useState<'all' | '7' | '8' | '9'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Form modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [examNumber, setExamNumber] = useState('');
  const [name, setName] = useState('');
  const [grade, setGrade] = useState<'7' | '8' | '9'>('7');
  const [className, setClassName] = useState('7A');
  const [room, setRoom] = useState('R.01');

  // Bulk import state
  const [importOpen, setImportOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return students.filter((s) => {
      if (gradeFilter !== 'all' && s.grade !== gradeFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.examNumber.toLowerCase().includes(q) ||
        s.className.toLowerCase().includes(q) ||
        s.room.toLowerCase().includes(q)
      );
    });
  }, [students, gradeFilter, searchQuery]);

  const openCreateModal = () => {
    setEditingStudent(null);
    setExamNumber('');
    setName('');
    setGrade('7');
    setClassName('7A');
    setRoom('R.01');
    setError('');
    setFormOpen(true);
  };

  const openEditModal = (stu: Student) => {
    setEditingStudent(stu);
    setExamNumber(stu.examNumber);
    setName(stu.name);
    setGrade(stu.grade);
    setClassName(stu.className);
    setRoom(stu.room);
    setError('');
    setFormOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (editingStudent) {
        await updateStudent(editingStudent.id, { examNumber, name, grade, className, room });
        setMessage(`Data siswa "${name}" berhasil diperbarui.`);
      } else {
        await createStudent({ examNumber, name, grade, className, room });
        setMessage(`Siswa "${name}" berhasil ditambahkan.`);
      }
      setFormOpen(false);
      onStudentsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan data siswa.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!studentToDelete) return;
    setBusy(true);
    try {
      await deleteStudent(studentToDelete.id);
      setMessage(`Siswa "${studentToDelete.name}" dihapus.`);
      setStudentToDelete(null);
      onStudentsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus siswa.');
    } finally {
      setBusy(false);
    }
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const parsed = lines
      .map((line) => {
        const parts = line.includes('\t')
          ? line.split('\t')
          : line.includes(';')
          ? line.split(';')
          : line.split(',');
        const [num, stuName, grd, cls, rm] = parts.map((p) => p.trim());
        if (!num || !stuName || num.toLowerCase().includes('peserta')) return null;
        return {
          examNumber: num,
          name: stuName,
          grade: grd || '7',
          className: cls || `${grd || '7'}A`,
          room: rm || 'R.01',
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (parsed.length === 0) {
      setError('Tidak ada baris siswa yang valid. Format: NoPeserta, Nama, Tingkat(7/8/9), Kelas, Ruang');
      return;
    }

    setBusy(true);
    try {
      const res = await bulkImportStudents(parsed);
      setMessage(`Impor selesai: ${res.added} siswa baru, ${res.updated} diperbarui.`);
      setImportOpen(false);
      setBulkText('');
      onStudentsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengimpor data siswa.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Kelola Data Master Siswa (Admin)</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Daftar siswa ini akan tampil pada halaman pilihan siswa sebelum Guru memindai LJK.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setError('');
                setImportOpen((v) => !v);
              }}
              className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Upload className="h-3.5 w-3.5" />
              Impor Massal (CSV/Excel)
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              Tambah Siswa
            </button>
          </div>
        </div>

        {message && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
            {message}
          </div>
        )}
        {error && !formOpen && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        {importOpen && (
          <form
            onSubmit={handleBulkImport}
            className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">
                Tempel Data Siswa (Format: No Peserta, Nama Lengkap, Tingkat, Kelas, Ruang)
              </p>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              rows={5}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={`2627-07-007, Sinta Dewi, 7, 7B, R.02\n2627-08-006, Ridwan Kamil, 8, 8A, R.03`}
              className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[38px] rounded-lg bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {busy ? 'Mengimpor...' : 'Proses Impor'}
              </button>
            </div>
          </form>
        )}

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
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
                {g === 'all' ? `Semua (${students.length})` : `Kelas ${g}`}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama, no. peserta, kelas, atau ruang..."
              className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>
        </div>

        {/* Table */}
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-3.5 py-3">No</th>
                <th className="px-3.5 py-3">No. Peserta</th>
                <th className="px-3.5 py-3">Nama Lengkap</th>
                <th className="px-3.5 py-3">Tingkat</th>
                <th className="px-3.5 py-3">Kelas</th>
                <th className="px-3.5 py-3">Ruang</th>
                <th className="px-3.5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                    Tidak ada data siswa.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((stu, idx) => (
                  <tr key={stu.id} className="hover:bg-slate-50/70">
                    <td className="px-3.5 py-2.5 font-mono text-xs text-slate-500 tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-xs font-medium text-slate-800 tabular-nums">
                      {stu.examNumber}
                    </td>
                    <td className="px-3.5 py-2.5 font-medium text-slate-900">{stu.name}</td>
                    <td className="px-3.5 py-2.5 text-xs text-slate-600">Kelas {stu.grade}</td>
                    <td className="px-3.5 py-2.5 text-xs font-medium text-slate-700">
                      {stu.className}
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-xs text-slate-600">{stu.room}</td>
                    <td className="px-3.5 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(stu)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          aria-label={`Ubah ${stu.name}`}
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setStudentToDelete(stu)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Hapus ${stu.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add/Edit Modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveStudent}
            className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {editingStudent ? 'Ubah Data Siswa' : 'Tambah Siswa Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Nomor Peserta Ujian
                </label>
                <input
                  type="text"
                  required
                  value={examNumber}
                  onChange={(e) => setExamNumber(e.target.value)}
                  placeholder="Contoh: 2627-07-016"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Nama Lengkap Siswa
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama lengkap sesuai absen"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Tingkat</label>
                  <select
                    value={grade}
                    onChange={(e) => {
                      const nextG = e.target.value as '7' | '8' | '9';
                      setGrade(nextG);
                      if (!editingStudent) setClassName(`${nextG}A`);
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="7">7</option>
                    <option value="8">8</option>
                    <option value="9">9</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Rombel</label>
                  <input
                    type="text"
                    required
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    placeholder="7A"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Ruang</label>
                  <input
                    type="text"
                    required
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    placeholder="R.01"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="min-h-[40px] rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[40px] rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {busy ? 'Menyimpan...' : 'Simpan Siswa'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={Boolean(studentToDelete)}
        title="Hapus Data Siswa?"
        description={`Hapus siswa ${studentToDelete?.name ?? ''} (${studentToDelete?.examNumber ?? ''}) dari daftar master?`}
        confirmLabel="Hapus Siswa"
        destructive
        busy={busy}
        onConfirm={handleConfirmDelete}
        onCancel={() => setStudentToDelete(null)}
      />
    </div>
  );
}
