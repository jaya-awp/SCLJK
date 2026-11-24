export type UserRole = 'admin' | 'guru';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

export interface Student {
  id: string;
  examNumber: string;
  name: string;
  grade: '7' | '8' | '9';
  className: string;
  room: string;
  createdAt: string;
  updatedAt: string;
}

export type AnswerOption = 'a' | 'b' | 'c' | 'd';
export type ScannedAnswerValue = AnswerOption | 'kosong' | 'ganda';

export interface SubjectExam {
  id: string;
  code: string;
  subjectNumber: number;
  name: string;
  questionCount: number;
  kkm: number;
  pgWeight: number;
  essayWeight: number;
  answerKey: AnswerOption[];
  updatedAt: string;
}

export interface ScannedItem {
  number: number;
  selected: ScannedAnswerValue;
  correctAnswer: AnswerOption;
  isCorrect: boolean;
  correctedMark: boolean;
  confidence: 'high' | 'medium' | 'low';
}

export interface ScanPreviewResult {
  examId: string;
  studentId: string;
  detectedSubject: string;
  detectedName: string;
  detectedClass: string;
  detectedExamNumber: string;
  answers: ScannedItem[];
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  multipleCount: number;
  pgScore: number;
  notes: string;
}

export interface ScanRecord {
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
  answers: ScannedAnswerValue[];
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

export interface ItemAnalysisRow {
  questionNumber: number;
  correctAnswer: AnswerOption;
  totalResponses: number;
  correctCount: number;
  wrongCount: number;
  blankOrMultipleCount: number;
  difficultyIndex: number;
  difficultyLabel: 'Sukar' | 'Sedang' | 'Mudah';
  discriminationIndex: number;
  discriminationLabel: 'Baik Sekali' | 'Baik' | 'Cukup' | 'Jelek';
  optionCounts: {
    a: number;
    b: number;
    c: number;
    d: number;
    other: number;
  };
  ineffectiveDistractors: AnswerOption[];
  recommendation: 'Pertahankan' | 'Revisi Pengecoh' | 'Revisi Soal' | 'Buang / Ganti';
}

export interface ExamStatistics {
  totalStudents: number;
  mean: number;
  median: number;
  highest: number;
  lowest: number;
  stdDev: number;
  passCount: number;
  passRate: number;
  kr20Reliability: number | null;
}

export interface SheetsConfig {
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  lastSyncedAt: string | null;
  lastSyncedBy: string | null;
}
