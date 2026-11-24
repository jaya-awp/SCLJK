import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  Printer,
  XCircle,
} from 'lucide-react';
import { exportItemAnalysisCsv } from '../lib/csvExport';
import { computeItemAnalysis } from '../lib/itemAnalysis';
import type { ScanRecord, SubjectExam } from '../types';

interface ItemAnalysisViewProps {
  exams: SubjectExam[];
  scans: ScanRecord[];
  selectedExamId: string;
  onSelectExamId: (examId: string) => void;
}

export function ItemAnalysisView({
  exams,
  scans,
  selectedExamId,
  onSelectExamId,
}: ItemAnalysisViewProps) {
  const [filterMode, setFilterMode] = useState<'all' | 'good' | 'revise' | 'drop'>('all');

  const activeExam = useMemo(
    () => exams.find((e) => e.id === selectedExamId) ?? exams[0] ?? null,
    [exams, selectedExamId]
  );

  const examScans = useMemo(
    () => (activeExam ? scans.filter((s) => s.examId === activeExam.id) : []),
    [scans, activeExam]
  );

  const { rows, stats } = useMemo(() => {
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
    return computeItemAnalysis(activeExam, examScans);
  }, [activeExam, examScans]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filterMode === 'good') return r.recommendation === 'Pertahankan';
      if (filterMode === 'revise') {
        return r.recommendation === 'Revisi Pengecoh' || r.recommendation === 'Revisi Soal';
      }
      if (filterMode === 'drop') return r.recommendation === 'Buang / Ganti';
      return true;
    });
  }, [rows, filterMode]);

  const qualitySummary = useMemo(() => {
    const keep = rows.filter((r) => r.recommendation === 'Pertahankan').length;
    const revise = rows.filter(
      (r) => r.recommendation === 'Revisi Pengecoh' || r.recommendation === 'Revisi Soal'
    ).length;
    const drop = rows.filter((r) => r.recommendation === 'Buang / Ganti').length;
    return { keep, revise, drop };
  }, [rows]);

  // Score buckets for SVG histogram (0-49, 50-64, 65-74, 75-84, 85-100)
  const scoreBuckets = useMemo(() => {
    const buckets = [
      { label: '< 50', count: 0 },
      { label: '50–64', count: 0 },
      { label: '65–74', count: 0 },
      { label: '75–84', count: 0 },
      { label: '85–100', count: 0 },
    ];
    for (const s of examScans) {
      if (s.finalScore < 50) buckets[0].count++;
      else if (s.finalScore < 65) buckets[1].count++;
      else if (s.finalScore < 75) buckets[2].count++;
      else if (s.finalScore < 85) buckets[3].count++;
      else buckets[4].count++;
    }
    const maxCount = Math.max(1, ...buckets.map((b) => b.count));
    return { buckets, maxCount };
  }, [examScans]);

  return (
    <div className="space-y-6 print-full">
      {/* Header & Controls */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Analisis Butir Soal — {activeExam?.name ?? '-'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Evaluasi Tingkat Kesukaran (P), Daya Pembeda (D), Efektivitas Pengecoh, dan
              Reliabilitas KR-20.
            </p>
          </div>

          <div className="no-print flex flex-wrap items-center gap-2">
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

            <button
              type="button"
              disabled={!activeExam || rows.length === 0}
              onClick={() => activeExam && exportItemAnalysisCsv(activeExam, rows, stats)}
              className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV Analisis Soal
            </button>

            <button
              type="button"
              disabled={rows.length === 0}
              onClick={() => window.print()}
              className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Printer className="h-3.5 w-3.5" />
              Cetak
            </button>
          </div>
        </div>

        {/* Key Psychometric Metrics */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Peserta Dinilai</p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
              {stats.totalStudents}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Rata-rata / Median</p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
              {stats.mean}{' '}
              <span className="text-xs font-normal text-slate-500">/ {stats.median}</span>
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Min / Maks</p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
              {stats.lowest} <span className="text-xs font-normal text-slate-500">/ {stats.highest}</span>
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Ketuntasan KKM</p>
            <p className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">
              {stats.passRate}%
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Simpangan Baku</p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
              {stats.stdDev}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Reliabilitas KR-20</p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
              {stats.kr20Reliability !== null ? stats.kr20Reliability : '-'}
            </p>
          </div>
        </div>
      </section>

      {examScans.length === 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <BarChart3 className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-3 text-base font-semibold text-slate-900">
            Belum Ada Data untuk Dianalisis
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Pindai minimal 1 lembar jawaban siswa (disarankan minimal 5–10 siswa untuk indeks daya
            pembeda yang representatif) pada tab Scanner.
          </p>
        </section>
      ) : (
        <>
          {/* Visual Distribution Row */}
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Score Histogram */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7">
              <h3 className="text-sm font-semibold text-slate-900">Sebaran Nilai Akhir Siswa</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Pengelompokan rentang nilai dari {stats.totalStudents} siswa
              </p>

              <div className="mt-5 flex h-44 items-end gap-3 border-b border-slate-200 pb-2">
                {scoreBuckets.buckets.map((b) => {
                  const pct = Math.round((b.count / scoreBuckets.maxCount) * 100);
                  return (
                    <div key={b.label} className="flex flex-1 flex-col items-center gap-1.5">
                      <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums">
                        {b.count}
                      </span>
                      <div className="flex h-28 w-full items-end justify-center">
                        <div
                          className="w-full max-w-[44px] rounded-t-md bg-emerald-600 transition-all"
                          style={{ height: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                      <span className="font-mono text-[11px] text-slate-500">{b.label}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Quality Summary */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5">
              <h3 className="text-sm font-semibold text-slate-900">Ringkasan Kualitas Butir Soal</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Rekomendasi otomatis berdasarkan P, D, dan pengecoh
              </p>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                  <div className="flex items-center gap-2.5 text-sm font-medium text-emerald-900">
                    <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                    <span>Pertahankan (Soal Baik)</span>
                  </div>
                  <span className="font-mono text-lg font-bold text-emerald-800 tabular-nums">
                    {qualitySummary.keep}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3">
                  <div className="flex items-center gap-2.5 text-sm font-medium text-amber-900">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span>Perlu Revisi Soal / Pengecoh</span>
                  </div>
                  <span className="font-mono text-lg font-bold text-amber-800 tabular-nums">
                    {qualitySummary.revise}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50/70 px-4 py-3">
                  <div className="flex items-center gap-2.5 text-sm font-medium text-red-900">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span>Buang / Ganti Butir Soal</span>
                  </div>
                  <span className="font-mono text-lg font-bold text-red-700 tabular-nums">
                    {qualitySummary.drop}
                  </span>
                </div>
              </div>
            </section>
          </div>

          {/* Detailed Table */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <h3 className="text-base font-semibold text-slate-900">
                Tabel Analisis 1–{activeExam?.questionCount ?? 50}
              </h3>

              <div className="no-print flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
                {(
                  [
                    ['all', `Semua (${rows.length})`],
                    ['good', `Baik (${qualitySummary.keep})`],
                    ['revise', `Revisi (${qualitySummary.revise})`],
                    ['drop', `Buang (${qualitySummary.drop})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilterMode(key)}
                    className={`min-h-[32px] rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                      filterMode === key
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-3 py-3">No</th>
                    <th className="px-3 py-3">Kunci</th>
                    <th className="px-3 py-3 text-right">Benar</th>
                    <th className="px-3 py-3 text-right">Salah</th>
                    <th className="px-3 py-3 text-right">Kesukaran (P)</th>
                    <th className="px-3 py-3 text-right">Daya Pembeda (D)</th>
                    <th className="px-3 py-3">Sebaran Jawaban (A · B · C · D)</th>
                    <th className="px-3 py-3">Pengecoh Lemah</th>
                    <th className="px-3 py-3">Rekomendasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((row) => (
                    <tr key={row.questionNumber} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2.5 font-mono text-xs font-bold text-slate-900 tabular-nums">
                        {row.questionNumber}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs font-bold uppercase text-emerald-700">
                        {row.correctAnswer}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-800 tabular-nums">
                        {row.correctCount}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-500 tabular-nums">
                        {row.wrongCount}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
                        <span className="font-semibold text-slate-900">{row.difficultyIndex}</span>{' '}
                        <span className="text-slate-500">({row.difficultyLabel})</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
                        <span className="font-semibold text-slate-900">
                          {row.discriminationIndex}
                        </span>{' '}
                        <span className="text-slate-500">({row.discriminationLabel})</span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-700 tabular-nums">
                        A:{row.optionCounts.a} · B:{row.optionCounts.b} · C:{row.optionCounts.c} · D:
                        {row.optionCounts.d}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        {row.ineffectiveDistractors.length === 0 ? (
                          <span className="text-emerald-700">Efektif</span>
                        ) : (
                          <span className="font-mono font-medium uppercase text-amber-700">
                            {row.ineffectiveDistractors.join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-medium">
                        {row.recommendation === 'Pertahankan' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Pertahankan
                          </span>
                        ) : row.recommendation === 'Buang / Ganti' ? (
                          <span className="inline-flex items-center gap-1 text-red-600">
                            <XCircle className="h-3.5 w-3.5" />
                            Buang / Ganti
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {row.recommendation}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
