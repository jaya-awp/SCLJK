import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type StoredAnswerOption = 'a' | 'b' | 'c' | 'd';
export type StoredScannedAnswer = StoredAnswerOption | 'kosong' | 'ganda';

export interface StoredUser {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'guru';
  passwordHash: string;
  active: boolean;
  createdAt: string;
}

export interface StoredStudent {
  id: string;
  examNumber: string;
  name: string;
  grade: '7' | '8' | '9';
  className: string;
  room: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredExam {
  id: string;
  code: string;
  subjectNumber: number;
  name: string;
  questionCount: number;
  kkm: number;
  pgWeight: number;
  essayWeight: number;
  answerKey: StoredAnswerOption[];
  updatedAt: string;
}

export interface StoredScanRecord {
  id: string;
  studentId: string;
  studentExamNumber: string;
  studentName: string;
  studentGrade: '7' | '8' | '9';
  studentClassName: string;
  studentRoom: string;
  examId: string;
  examName: string;
  questionCount: number;
  answers: StoredScannedAnswer[];
  correctedMarks: number[];
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  pgScore: number;
  essayScore: number;
  finalScore: number;
  passed: boolean;
  scannedBy: string;
  scannedByName: string;
  scannedAt: string;
  syncedToSheets: boolean;
}

export interface StoredSheetsConfig {
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  lastSyncedAt: string | null;
  lastSyncedBy: string | null;
}

export interface DatabaseState {
  users: StoredUser[];
  students: StoredStudent[];
  exams: StoredExam[];
  scans: StoredScanRecord[];
  sheetsConfig: StoredSheetsConfig;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.resolve(DATA_DIR, 'ljk-database.json');

const BASE_KEY_PATTERN: StoredAnswerOption[] = ['a', 'b', 'c', 'd', 'b', 'a', 'd', 'c', 'a', 'c'];

function buildDefaultKey(seedOffset: number, count = 50): StoredAnswerOption[] {
  const options: StoredAnswerOption[] = ['a', 'b', 'c', 'd'];
  return Array.from({ length: count }, (_, index) => {
    const base = BASE_KEY_PATTERN[index % BASE_KEY_PATTERN.length];
    const baseIdx = options.indexOf(base);
    return options[(baseIdx + seedOffset + Math.floor(index / 10)) % 4];
  });
}

function createInitialDatabase(): DatabaseState {
  const now = new Date().toISOString();

  const subjects: Array<{ num: number; code: string; name: string }> = [
    { num: 1, code: 'QH', name: "Al-Qur'an Hadits" },
    { num: 2, code: 'PKN', name: 'PPKn' },
    { num: 3, code: 'IND', name: 'B. Indonesia' },
    { num: 4, code: 'ING', name: 'B. Inggris' },
    { num: 5, code: 'MTK', name: 'Matematika' },
    { num: 6, code: 'IPA', name: 'IPA' },
    { num: 7, code: 'IPS', name: 'IPS' },
    { num: 8, code: 'SBK', name: 'Seni Budaya' },
    { num: 9, code: 'AA', name: 'Akidah Akhlak' },
    { num: 10, code: 'SKI', name: 'SKI' },
    { num: 11, code: 'ARB', name: 'Bahasa Arab' },
    { num: 12, code: 'SND', name: 'Muatan Lokal (B. Sunda)' },
    { num: 13, code: 'FQH', name: 'Fiqih' },
    { num: 14, code: 'INF', name: 'Informatika' },
    { num: 15, code: 'PJK', name: 'PJOK' },
  ];

  const exams: StoredExam[] = subjects.map((sub, idx) => ({
    id: `exam-${sub.code.toLowerCase()}`,
    code: sub.code,
    subjectNumber: sub.num,
    name: sub.name,
    questionCount: 50,
    kkm: 75,
    pgWeight: 100,
    essayWeight: 0,
    answerKey: buildDefaultKey(idx, 50),
    updatedAt: now,
  }));

  const sampleStudents: Array<Omit<StoredStudent, 'id' | 'createdAt' | 'updatedAt'>> = [
    { examNumber: '2627-07-001', name: 'Ahmad Fauzan Pratama', grade: '7', className: '7A', room: 'R.01' },
    { examNumber: '2627-07-002', name: 'Aisyah Rahmawati', grade: '7', className: '7A', room: 'R.01' },
    { examNumber: '2627-07-003', name: 'Daffa Maulana Yusuf', grade: '7', className: '7A', room: 'R.01' },
    { examNumber: '2627-07-004', name: 'Fitriani Nurhaliza', grade: '7', className: '7A', room: 'R.01' },
    { examNumber: '2627-07-005', name: 'M. Rizky Hidayatullah', grade: '7', className: '7B', room: 'R.02' },
    { examNumber: '2627-07-006', name: 'Siti Aminah Lestari', grade: '7', className: '7B', room: 'R.02' },
    { examNumber: '2627-08-001', name: 'Bagas Kurniawan', grade: '8', className: '8A', room: 'R.03' },
    { examNumber: '2627-08-002', name: 'Dewi Anggraeni', grade: '8', className: '8A', room: 'R.03' },
    { examNumber: '2627-08-003', name: 'Hilman Syahputra', grade: '8', className: '8A', room: 'R.03' },
    { examNumber: '2627-08-004', name: 'Nabila Putri Salsabila', grade: '8', className: '8B', room: 'R.04' },
    { examNumber: '2627-08-005', name: 'Rendi Setiawan', grade: '8', className: '8B', room: 'R.04' },
    { examNumber: '2627-09-001', name: 'Fajar Sidik Permana', grade: '9', className: '9A', room: 'R.05' },
    { examNumber: '2627-09-002', name: 'Intan Permata Sari', grade: '9', className: '9A', room: 'R.05' },
    { examNumber: '2627-09-003', name: 'Muhammad Ilham', grade: '9', className: '9A', room: 'R.05' },
    { examNumber: '2627-09-004', name: 'Zahra Khairunnisa', grade: '9', className: '9B', room: 'R.06' },
  ];

  const students: StoredStudent[] = sampleStudents.map((s) => ({
    id: `stu-${crypto.randomUUID().slice(0, 8)}`,
    ...s,
    createdAt: now,
    updatedAt: now,
  }));

  return {
    users: [],
    students,
    exams,
    scans: [],
    sheetsConfig: {
      spreadsheetId: '',
      spreadsheetTitle: '',
      spreadsheetUrl: '',
      lastSyncedAt: null,
      lastSyncedBy: null,
    },
  };
}

let cachedDb: DatabaseState | null = null;

export function loadDatabase(): DatabaseState {
  if (cachedDb) {
    return cachedDb;
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const initial = createInitialDatabase();
    saveDatabase(initial);
    cachedDb = initial;
    return cachedDb;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as DatabaseState;
    cachedDb = {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      students: Array.isArray(parsed.students) ? parsed.students : [],
      exams: Array.isArray(parsed.exams) ? parsed.exams : [],
      scans: Array.isArray(parsed.scans) ? parsed.scans : [],
      sheetsConfig: parsed.sheetsConfig || {
        spreadsheetId: '',
        spreadsheetTitle: '',
        spreadsheetUrl: '',
        lastSyncedAt: null,
        lastSyncedBy: null,
      },
    };
    return cachedDb;
  } catch {
    const initial = createInitialDatabase();
    saveDatabase(initial);
    cachedDb = initial;
    return cachedDb;
  }
}

export function saveDatabase(state: DatabaseState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${DB_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
  cachedDb = state;
}
