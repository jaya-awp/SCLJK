import type { AuthUser, ScanPreviewResult, ScanRecord, SheetsConfig, Student, SubjectExam } from '../types';

let authTokenInMemory: string | null = null;

export function setAuthToken(token: string | null): void {
  authTokenInMemory = token;
}

export function getAuthToken(): string | null {
  return authTokenInMemory;
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (authTokenInMemory) {
    headers.set('Authorization', `Bearer ${authTokenInMemory}`);
  }

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { error: text || 'Respons server tidak valid.' };
  }

  if (!res.ok) {
    const errMsg = typeof data.error === 'string' ? data.error : `Error ${res.status}`;
    throw new Error(errMsg);
  }
  return data as T;
}

export async function fetchAuthStatus(): Promise<{
  adminConfigured: boolean;
  hasEnvAdmin: boolean;
  hasGuru: boolean;
}> {
  return apiFetch('/api/auth/status');
}

export async function setupInitialAdmin(payload: {
  adminUsername: string;
  adminDisplayName: string;
  adminPasscode: string;
  createGuru: boolean;
  guruUsername?: string;
  guruDisplayName?: string;
  guruPasscode?: string;
}): Promise<{ token: string; user: AuthUser }> {
  const data = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/setup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  setAuthToken(data.token);
  return data;
}

export async function loginAccount(
  username: string,
  passcode: string
): Promise<{ token: string; user: AuthUser }> {
  const data = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, passcode }),
  });
  setAuthToken(data.token);
  return data;
}

export async function fetchUsers(): Promise<AuthUser[]> {
  const data = await apiFetch<{ users: AuthUser[] }>('/api/users');
  return data.users;
}

export async function createUserAccount(payload: {
  username: string;
  displayName: string;
  passcode: string;
  role: 'admin' | 'guru';
}): Promise<AuthUser> {
  const data = await apiFetch<{ user: AuthUser }>('/api/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.user;
}

export async function updateUserAccount(
  id: string,
  payload: { displayName?: string; active?: boolean; passcode?: string }
): Promise<AuthUser> {
  const data = await apiFetch<{ user: AuthUser }>(`/api/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return data.user;
}

export async function deleteUserAccount(id: string): Promise<void> {
  await apiFetch(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchStudents(): Promise<Student[]> {
  const data = await apiFetch<{ students: Student[] }>('/api/students');
  return data.students;
}

export async function createStudent(payload: {
  examNumber: string;
  name: string;
  grade: '7' | '8' | '9';
  className: string;
  room: string;
}): Promise<Student> {
  const data = await apiFetch<{ student: Student }>('/api/students', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.student;
}

export async function bulkImportStudents(
  students: Array<{
    examNumber: string;
    name: string;
    grade: string;
    className: string;
    room: string;
  }>
): Promise<{ added: number; updated: number; students: Student[] }> {
  return apiFetch('/api/students', {
    method: 'POST',
    body: JSON.stringify({ students }),
  });
}

export async function updateStudent(
  id: string,
  payload: Partial<Pick<Student, 'examNumber' | 'name' | 'grade' | 'className' | 'room'>>
): Promise<Student> {
  const data = await apiFetch<{ student: Student }>(`/api/students/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return data.student;
}

export async function deleteStudent(id: string): Promise<void> {
  await apiFetch(`/api/students/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchExams(): Promise<SubjectExam[]> {
  const data = await apiFetch<{ exams: SubjectExam[] }>('/api/exams');
  return data.exams;
}

export async function createExam(payload: {
  code: string;
  name: string;
  questionCount: number;
  kkm: number;
  pgWeight: number;
  answerKey: string[];
}): Promise<SubjectExam> {
  const data = await apiFetch<{ exam: SubjectExam }>('/api/exams', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.exam;
}

export async function updateExam(
  id: string,
  payload: Partial<Pick<SubjectExam, 'name' | 'questionCount' | 'kkm' | 'pgWeight' | 'answerKey'>>
): Promise<SubjectExam> {
  const data = await apiFetch<{ exam: SubjectExam }>(`/api/exams/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return data.exam;
}

export async function deleteExam(id: string): Promise<void> {
  await apiFetch(`/api/exams/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function scanLjkImage(payload: {
  imageBase64: string;
  mimeType: string;
  examId: string;
  studentId: string;
}): Promise<ScanPreviewResult> {
  const data = await apiFetch<{ result: ScanPreviewResult }>('/api/ljk/scan', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.result;
}

export async function fetchScans(examId?: string): Promise<ScanRecord[]> {
  const qs = examId ? `?examId=${encodeURIComponent(examId)}` : '';
  const data = await apiFetch<{ scans: ScanRecord[] }>(`/api/scans${qs}`);
  return data.scans;
}

export async function saveScanRecord(payload: {
  studentId: string;
  examId: string;
  answers: string[];
  correctedMarks: number[];
  essayScore: number;
  markSynced?: boolean;
}): Promise<ScanRecord> {
  const data = await apiFetch<{ scan: ScanRecord }>('/api/scans', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.scan;
}

export async function markScansSynced(examId: string): Promise<void> {
  await apiFetch('/api/scans/mark-synced', {
    method: 'POST',
    body: JSON.stringify({ examId }),
  });
}

export async function deleteScanRecord(id: string): Promise<void> {
  await apiFetch(`/api/scans/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchSheetsConfig(): Promise<SheetsConfig> {
  const data = await apiFetch<{ config: SheetsConfig }>('/api/sheets/config');
  return data.config;
}

export async function updateSheetsConfig(payload: {
  spreadsheetId?: string;
  spreadsheetTitle?: string;
  spreadsheetUrl?: string;
  synced?: boolean;
}): Promise<SheetsConfig> {
  const data = await apiFetch<{ config: SheetsConfig }>('/api/sheets/config', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.config;
}
