import type { ExamStatistics, ItemAnalysisRow, ScanRecord, SubjectExam } from '../types';

function escapeCsvCell(value: string | number | boolean): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerCsvDownload(filename: string, rows: (string | number | boolean)[][]): void {
  const csvContent =
    '\uFEFF' + rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportRecapCsv(exam: SubjectExam, scans: ScanRecord[]): void {
  const qHeaders = Array.from({ length: exam.questionCount }, (_, i) => `S${i + 1}`);
  const header = [
    'No',
    'Waktu Scan',
    'No. Peserta',
    'Nama Siswa',
    'Kelas',
    'Ruang',
    'Mata Pelajaran',
    'Benar',
    'Salah',
    'Kosong/Ganda',
    'Skor PG',
    'Skor Essay',
    'Nilai Akhir',
    `Status (KKM ${exam.kkm})`,
    'Pemeriksa',
    ...qHeaders,
  ];

  const rows = [
    header,
    ...scans.map((scan, idx) => [
      idx + 1,
      new Date(scan.scannedAt).toLocaleString('id-ID'),
      scan.studentExamNumber,
      scan.studentName,
      scan.studentClassName,
      scan.studentRoom,
      scan.examName,
      scan.correctCount,
      scan.wrongCount,
      scan.blankCount,
      scan.pgScore,
      scan.essayScore,
      scan.finalScore,
      scan.passed ? 'Tuntas' : 'Remedial',
      scan.scannedByName,
      ...scan.answers.map((a) => a.toUpperCase()),
    ]),
  ];

  const safeCode = exam.code.toLowerCase().replace(/[^a-z0-9]/g, '');
  triggerCsvDownload(`rekap-nilai-${safeCode}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
}

export function exportItemAnalysisCsv(
  exam: SubjectExam,
  rowsData: ItemAnalysisRow[],
  stats: ExamStatistics
): void {
  const headerRows: (string | number | boolean)[][] = [
    ['LAPORAN ANALISIS BUTIR SOAL', exam.name, `Kode: ${exam.code}`, `KKM: ${exam.kkm}`],
    [
      `Peserta: ${stats.totalStudents}`,
      `Rata-rata: ${stats.mean}`,
      `Tertinggi: ${stats.highest}`,
      `Terendah: ${stats.lowest}`,
      `Ketuntasan: ${stats.passRate}%`,
      `KR-20: ${stats.kr20Reliability ?? '-'}`,
    ],
    [],
    [
      'No. Soal',
      'Kunci Jawaban',
      'Jml Benar',
      'Jml Salah',
      'Kosong/Ganda',
      'Tingkat Kesukaran (P)',
      'Kategori Kesukaran',
      'Daya Pembeda (D)',
      'Kategori Daya Pembeda',
      'Pilih A',
      'Pilih B',
      'Pilih C',
      'Pilih D',
      'Pengecoh Kurang Efektif',
      'Rekomendasi',
    ],
    ...rowsData.map((r) => [
      r.questionNumber,
      r.correctAnswer.toUpperCase(),
      r.correctCount,
      r.wrongCount,
      r.blankOrMultipleCount,
      r.difficultyIndex,
      r.difficultyLabel,
      r.discriminationIndex,
      r.discriminationLabel,
      r.optionCounts.a,
      r.optionCounts.b,
      r.optionCounts.c,
      r.optionCounts.d,
      r.ineffectiveDistractors.length > 0
        ? r.ineffectiveDistractors.map((o) => o.toUpperCase()).join('; ')
        : 'Semua Efektif',
      r.recommendation,
    ]),
  ];

  const safeCode = exam.code.toLowerCase().replace(/[^a-z0-9]/g, '');
  triggerCsvDownload(
    `analisis-butir-soal-${safeCode}-${new Date().toISOString().slice(0, 10)}.csv`,
    headerRows
  );
}
