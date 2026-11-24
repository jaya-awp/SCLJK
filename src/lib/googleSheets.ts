import type { ExamStatistics, ItemAnalysisRow, ScanRecord, Student, SubjectExam } from '../types';

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

interface SheetTabInfo {
  properties: {
    sheetId: number;
    title: string;
  };
}

export async function getSpreadsheetMetadata(
  accessToken: string,
  spreadsheetId: string
): Promise<{
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  sheets: string[];
}> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Gagal membaca metadata Google Spreadsheet.');
  }
  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || 'Spreadsheet LJK',
    spreadsheetUrl:
      data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}`,
    sheets: Array.isArray(data.sheets)
      ? (data.sheets as SheetTabInfo[]).map((s) => s.properties.title)
      : [],
  };
}

export async function createLjkSpreadsheet(
  accessToken: string,
  title: string
): Promise<{
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
}> {
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: title.trim() || 'Database Nilai LJK & Analisis Butir Soal',
        locale: 'id_ID',
      },
      sheets: [
        {
          properties: {
            title: 'Rekap Nilai',
            gridProperties: { frozenRowCount: 1 },
          },
        },
        {
          properties: {
            title: 'Analisis Butir Soal',
            gridProperties: { frozenRowCount: 1 },
          },
        },
        {
          properties: {
            title: 'Master Siswa',
            gridProperties: { frozenRowCount: 1 },
          },
        },
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Gagal membuat Google Spreadsheet baru.');
  }

  // Format header rows on all 3 tabs
  const sheetIds = (data.sheets as SheetTabInfo[]).map((s) => s.properties.sheetId);
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(data.spreadsheetId)}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: sheetIds.map((sheetId) => ({
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.016, green: 0.471, blue: 0.341 },
                textFormat: {
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                  bold: true,
                },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        })),
      }),
    }
  ).catch(() => undefined);

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || title,
    spreadsheetUrl:
      data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}`,
  };
}

async function ensureRequiredTabs(
  accessToken: string,
  spreadsheetId: string,
  existingTabs: string[],
  requiredTabs: string[]
): Promise<void> {
  const missing = requiredTabs.filter((t) => !existingTabs.includes(t));
  if (missing.length === 0) return;

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: missing.map((title) => ({
          addSheet: {
            properties: {
              title,
              gridProperties: { frozenRowCount: 1 },
            },
          },
        })),
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Gagal menyiapkan tab sheet.');
  }
}

async function writeTabValues(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
  rows: (string | number)[][]
): Promise<void> {
  const encodedRange = encodeURIComponent(`${tabName}!A1:BZ`);
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodedRange}:clear`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const updateRange = encodeURIComponent(`${tabName}!A1`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${updateRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: rows,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gagal menulis data ke tab "${tabName}".`);
  }
}

export async function syncLjkDataToGoogleSheets(params: {
  accessToken: string;
  spreadsheetId: string;
  exam: SubjectExam;
  students: Student[];
  scans: ScanRecord[];
  analysisRows: ItemAnalysisRow[];
  stats: ExamStatistics;
}): Promise<{ syncedRows: number; syncedAt: string }> {
  const { accessToken, spreadsheetId, exam, students, scans, analysisRows, stats } = params;

  const meta = await getSpreadsheetMetadata(accessToken, spreadsheetId);
  await ensureRequiredTabs(accessToken, spreadsheetId, meta.sheets, [
    'Rekap Nilai',
    'Analisis Butir Soal',
    'Master Siswa',
  ]);

  const qHeaders = Array.from({ length: exam.questionCount }, (_, i) => `S${i + 1}`);
  const recapHeader: (string | number)[] = [
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

  const recapRows: (string | number)[][] = [
    recapHeader,
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

  const analysisRowsFormatted: (string | number)[][] = [
    [
      `ANALISIS BUTIR SOAL — ${exam.name}`,
      `Jumlah Peserta: ${stats.totalStudents}`,
      `Rata-rata: ${stats.mean}`,
      `Ketuntasan: ${stats.passRate}%`,
      `Reliabilitas KR-20: ${stats.kr20Reliability !== null ? stats.kr20Reliability : '-'}`,
    ],
    [
      'No. Soal',
      'Kunci Jawaban',
      'Jml Benar',
      'Jml Salah',
      'Kosong/Ganda',
      'Indeks Kesukaran (P)',
      'Kategori Kesukaran',
      'Daya Pembeda (D)',
      'Kategori Daya Pembeda',
      'Pilih A',
      'Pilih B',
      'Pilih C',
      'Pilih D',
      'Pengecoh Lemah',
      'Rekomendasi',
    ],
    ...analysisRows.map((row) => [
      row.questionNumber,
      row.correctAnswer.toUpperCase(),
      row.correctCount,
      row.wrongCount,
      row.blankOrMultipleCount,
      row.difficultyIndex,
      row.difficultyLabel,
      row.discriminationIndex,
      row.discriminationLabel,
      row.optionCounts.a,
      row.optionCounts.b,
      row.optionCounts.c,
      row.optionCounts.d,
      row.ineffectiveDistractors.length > 0
        ? row.ineffectiveDistractors.map((o) => o.toUpperCase()).join(', ')
        : 'Efektif Semua',
      row.recommendation,
    ]),
  ];

  const studentRows: (string | number)[][] = [
    ['No', 'No. Peserta', 'Nama Lengkap', 'Tingkat', 'Kelas', 'Ruang'],
    ...students.map((stu, idx) => [
      idx + 1,
      stu.examNumber,
      stu.name,
      `Kelas ${stu.grade}`,
      stu.className,
      stu.room,
    ]),
  ];

  await Promise.all([
    writeTabValues(accessToken, spreadsheetId, 'Rekap Nilai', recapRows),
    writeTabValues(accessToken, spreadsheetId, 'Analisis Butir Soal', analysisRowsFormatted),
    writeTabValues(accessToken, spreadsheetId, 'Master Siswa', studentRows),
  ]);

  return {
    syncedRows: scans.length,
    syncedAt: new Date().toISOString(),
  };
}
