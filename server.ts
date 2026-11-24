import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  type AuthenticatedRequest,
  hasConfiguredAdmin,
  hashPasscode,
  issueSessionToken,
  requireAdmin,
  requireAuth,
  verifyEnvAdminPasscode,
  verifyPasscode,
} from './server/auth.ts';
import { scanLjkImageWithGemini } from './server/ljkScanner.ts';
import {
  loadDatabase,
  saveDatabase,
  type StoredAnswerOption,
  type StoredScannedAnswer,
  type StoredScanRecord,
  type StoredStudent,
  type StoredUser,
} from './server/store.ts';

dotenv.config();

const PORT = 3000;
const VALID_OPTIONS: StoredAnswerOption[] = ['a', 'b', 'c', 'd'];
const VALID_SCANNED_VALUES: StoredScannedAnswer[] = ['a', 'b', 'c', 'd', 'kosong', 'ganda'];

function sanitizeUser(user: StoredUser) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
  };
}

function normalizeGrade(val: unknown): '7' | '8' | '9' {
  const s = String(val ?? '').trim();
  if (s === '8' || s.startsWith('8')) return '8';
  if (s === '9' || s.startsWith('9')) return '9';
  return '7';
}

function isValidUsername(u: string): boolean {
  return /^[a-zA-Z0-9_.-]{3,40}$/.test(u);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Auth Status
  app.get('/api/auth/status', (_req, res) => {
    const db = loadDatabase();
    const adminConfigured = hasConfiguredAdmin();
    const hasGuru = db.users.some((u) => u.role === 'guru' && u.active);
    res.json({
      adminConfigured,
      hasEnvAdmin: Boolean(process.env.ADMIN_PASSCODE?.trim()),
      hasGuru,
    });
  });

  // First-Run Admin Setup (locks automatically once an Admin exists or env ADMIN_PASSCODE is set)
  app.post('/api/auth/setup', (req, res) => {
    if (hasConfiguredAdmin()) {
      res.status(409).json({ error: 'Akun Admin sudah terdaftar. Silakan masuk melalui halaman login.' });
      return;
    }

    const {
      adminUsername,
      adminDisplayName,
      adminPasscode,
      createGuru,
      guruUsername,
      guruDisplayName,
      guruPasscode,
    } = req.body ?? {};

    const cleanAdminUser = String(adminUsername ?? '').trim().toLowerCase();
    const cleanAdminName = String(adminDisplayName ?? '').trim();
    const cleanAdminPass = String(adminPasscode ?? '');

    if (!isValidUsername(cleanAdminUser)) {
      res.status(400).json({ error: 'Username Admin harus 3–40 karakter (huruf, angka, titik, atau garis bawah).' });
      return;
    }
    if (cleanAdminName.length < 2 || cleanAdminName.length > 80) {
      res.status(400).json({ error: 'Nama lengkap Admin harus 2–80 karakter.' });
      return;
    }
    if (cleanAdminPass.length < 6 || cleanAdminPass.length > 100) {
      res.status(400).json({ error: 'Kata sandi Admin minimal 6 karakter.' });
      return;
    }

    const now = new Date().toISOString();
    const db = loadDatabase();

    const adminUser: StoredUser = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      username: cleanAdminUser,
      displayName: cleanAdminName,
      role: 'admin',
      passwordHash: hashPasscode(cleanAdminPass),
      active: true,
      createdAt: now,
    };
    db.users.push(adminUser);

    if (createGuru) {
      const cleanGuruUser = String(guruUsername ?? '').trim().toLowerCase();
      const cleanGuruName = String(guruDisplayName ?? '').trim();
      const cleanGuruPass = String(guruPasscode ?? '');
      if (!isValidUsername(cleanGuruUser) || cleanGuruUser === cleanAdminUser) {
        res.status(400).json({ error: 'Username Guru tidak valid atau sama dengan Admin.' });
        return;
      }
      if (cleanGuruName.length < 2 || cleanGuruName.length > 80) {
        res.status(400).json({ error: 'Nama Guru harus 2–80 karakter.' });
        return;
      }
      if (cleanGuruPass.length < 6 || cleanGuruPass.length > 100) {
        res.status(400).json({ error: 'Kata sandi Guru minimal 6 karakter.' });
        return;
      }
      db.users.push({
        id: `usr-${crypto.randomUUID().slice(0, 8)}`,
        username: cleanGuruUser,
        displayName: cleanGuruName,
        role: 'guru',
        passwordHash: hashPasscode(cleanGuruPass),
        active: true,
        createdAt: now,
      });
    }

    saveDatabase(db);
    const token = issueSessionToken(adminUser);
    res.status(201).json({ token, user: sanitizeUser(adminUser) });
  });

  // Login (Admin or Guru)
  app.post('/api/auth/login', (req, res) => {
    const { username, passcode } = req.body ?? {};
    const cleanUser = String(username ?? '').trim().toLowerCase();
    const cleanPass = String(passcode ?? '');

    if (!cleanUser || !cleanPass) {
      res.status(400).json({ error: 'Username dan kata sandi wajib diisi.' });
      return;
    }

    // Support ADMIN_PASSCODE environment override when username is 'admin'
    if (cleanUser === 'admin' && verifyEnvAdminPasscode(cleanPass)) {
      const envAdmin = {
        id: 'env-admin',
        username: 'admin',
        displayName: 'Administrator Sekolah',
        role: 'admin' as const,
        active: true,
        createdAt: new Date().toISOString(),
      };
      const token = issueSessionToken(envAdmin);
      res.json({ token, user: envAdmin });
      return;
    }

    const db = loadDatabase();
    const user = db.users.find((u) => u.username.toLowerCase() === cleanUser);
    if (!user || !verifyPasscode(cleanPass, user.passwordHash)) {
      res.status(401).json({ error: 'Username atau kata sandi salah.' });
      return;
    }
    if (!user.active) {
      res.status(403).json({ error: 'Akun ini sedang dinonaktifkan oleh Admin.' });
      return;
    }

    const token = issueSessionToken(user);
    res.json({ token, user: sanitizeUser(user) });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.authUser });
  });

  // Admin-only Guru Account Management
  app.get('/api/users', requireAuth, requireAdmin, (_req, res) => {
    const db = loadDatabase();
    res.json({
      users: db.users.map(sanitizeUser),
    });
  });

  app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
    const { username, displayName, passcode, role } = req.body ?? {};
    const cleanUsername = String(username ?? '').trim().toLowerCase();
    const cleanName = String(displayName ?? '').trim();
    const cleanPass = String(passcode ?? '');
    const targetRole = role === 'admin' ? 'admin' : 'guru';

    if (!isValidUsername(cleanUsername)) {
      res.status(400).json({ error: 'Username harus 3–40 karakter (huruf, angka, titik, atau garis bawah).' });
      return;
    }
    if (cleanName.length < 2 || cleanName.length > 80) {
      res.status(400).json({ error: 'Nama lengkap harus 2–80 karakter.' });
      return;
    }
    if (cleanPass.length < 6 || cleanPass.length > 100) {
      res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
      return;
    }

    const db = loadDatabase();
    if (db.users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      res.status(409).json({ error: 'Username sudah digunakan.' });
      return;
    }

    const newUser: StoredUser = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      username: cleanUsername,
      displayName: cleanName,
      role: targetRole,
      passwordHash: hashPasscode(cleanPass),
      active: true,
      createdAt: new Date().toISOString(),
    };
    db.users.push(newUser);
    saveDatabase(db);
    res.status(201).json({ user: sanitizeUser(newUser) });
  });

  app.patch('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
    const db = loadDatabase();
    const user = db.users.find((u) => u.id === req.params.id);
    if (!user) {
      res.status(404).json({ error: 'Akun tidak ditemukan.' });
      return;
    }

    const { displayName, active, passcode } = req.body ?? {};
    if (typeof displayName === 'string' && displayName.trim().length >= 2) {
      user.displayName = displayName.trim().slice(0, 80);
    }
    if (typeof active === 'boolean') {
      if (user.role === 'admin' && !active) {
        const activeAdmins = db.users.filter((u) => u.role === 'admin' && u.active && u.id !== user.id);
        if (activeAdmins.length === 0 && !process.env.ADMIN_PASSCODE?.trim()) {
          res.status(400).json({ error: 'Minimal harus ada satu Admin yang aktif.' });
          return;
        }
      }
      user.active = active;
    }
    if (typeof passcode === 'string' && passcode.length > 0) {
      if (passcode.length < 6) {
        res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter.' });
        return;
      }
      user.passwordHash = hashPasscode(passcode);
    }

    saveDatabase(db);
    res.json({ user: sanitizeUser(user) });
  });

  app.delete('/api/users/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const idx = db.users.findIndex((u) => u.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Akun tidak ditemukan.' });
      return;
    }
    if (db.users[idx].id === req.authUser?.sub) {
      res.status(400).json({ error: 'Tidak dapat menghapus akun yang sedang digunakan.' });
      return;
    }
    db.users.splice(idx, 1);
    saveDatabase(db);
    res.json({ ok: true });
  });

  // Students (Read by Admin & Guru; Mutated ONLY by Admin)
  app.get('/api/students', requireAuth, (_req, res) => {
    const db = loadDatabase();
    const sorted = [...db.students].sort((a, b) => a.examNumber.localeCompare(b.examNumber));
    res.json({ students: sorted });
  });

  app.post('/api/students', requireAuth, requireAdmin, (req, res) => {
    const db = loadDatabase();
    const now = new Date().toISOString();

    if (Array.isArray(req.body?.students)) {
      const incoming = req.body.students as Array<Record<string, unknown>>;
      if (incoming.length === 0 || incoming.length > 500) {
        res.status(400).json({ error: 'Jumlah siswa impor harus antara 1 sampai 500 baris.' });
        return;
      }
      let added = 0;
      let updated = 0;
      for (const row of incoming) {
        const examNumber = String(row.examNumber ?? '').trim().slice(0, 40);
        const name = String(row.name ?? '').trim().slice(0, 100);
        if (!examNumber || !name) continue;
        const grade = normalizeGrade(row.grade);
        const className = String(row.className ?? `${grade}A`).trim().slice(0, 20);
        const room = String(row.room ?? 'R.01').trim().slice(0, 20);

        const existing = db.students.find((s) => s.examNumber.toLowerCase() === examNumber.toLowerCase());
        if (existing) {
          existing.name = name;
          existing.grade = grade;
          existing.className = className;
          existing.room = room;
          existing.updatedAt = now;
          updated++;
        } else {
          db.students.push({
            id: `stu-${crypto.randomUUID().slice(0, 8)}`,
            examNumber,
            name,
            grade,
            className,
            room,
            createdAt: now,
            updatedAt: now,
          });
          added++;
        }
      }
      saveDatabase(db);
      res.status(201).json({ added, updated, students: db.students });
      return;
    }

    const { examNumber, name, grade, className, room } = req.body ?? {};
    const cleanExamNum = String(examNumber ?? '').trim().slice(0, 40);
    const cleanName = String(name ?? '').trim().slice(0, 100);
    const cleanGrade = normalizeGrade(grade);
    const cleanClass = String(className ?? `${cleanGrade}A`).trim().slice(0, 20);
    const cleanRoom = String(room ?? 'R.01').trim().slice(0, 20);

    if (!cleanExamNum || !cleanName) {
      res.status(400).json({ error: 'Nomor peserta ujian dan nama siswa wajib diisi.' });
      return;
    }
    if (db.students.some((s) => s.examNumber.toLowerCase() === cleanExamNum.toLowerCase())) {
      res.status(409).json({ error: 'Nomor peserta ujian sudah terdaftar.' });
      return;
    }

    const student: StoredStudent = {
      id: `stu-${crypto.randomUUID().slice(0, 8)}`,
      examNumber: cleanExamNum,
      name: cleanName,
      grade: cleanGrade,
      className: cleanClass,
      room: cleanRoom,
      createdAt: now,
      updatedAt: now,
    };
    db.students.push(student);
    saveDatabase(db);
    res.status(201).json({ student });
  });

  app.patch('/api/students/:id', requireAuth, requireAdmin, (req, res) => {
    const db = loadDatabase();
    const student = db.students.find((s) => s.id === req.params.id);
    if (!student) {
      res.status(404).json({ error: 'Siswa tidak ditemukan.' });
      return;
    }
    const { examNumber, name, grade, className, room } = req.body ?? {};
    if (typeof examNumber === 'string' && examNumber.trim()) {
      const nextNum = examNumber.trim().slice(0, 40);
      if (db.students.some((s) => s.id !== student.id && s.examNumber.toLowerCase() === nextNum.toLowerCase())) {
        res.status(409).json({ error: 'Nomor peserta sudah dipakai siswa lain.' });
        return;
      }
      student.examNumber = nextNum;
    }
    if (typeof name === 'string' && name.trim()) {
      student.name = name.trim().slice(0, 100);
    }
    if (grade !== undefined) {
      student.grade = normalizeGrade(grade);
    }
    if (typeof className === 'string' && className.trim()) {
      student.className = className.trim().slice(0, 20);
    }
    if (typeof room === 'string' && room.trim()) {
      student.room = room.trim().slice(0, 20);
    }
    student.updatedAt = new Date().toISOString();
    saveDatabase(db);
    res.json({ student });
  });

  app.delete('/api/students/:id', requireAuth, requireAdmin, (req, res) => {
    const db = loadDatabase();
    const idx = db.students.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Siswa tidak ditemukan.' });
      return;
    }
    db.students.splice(idx, 1);
    saveDatabase(db);
    res.json({ ok: true });
  });

  // Exams & Answer Keys (Read by Admin & Guru; Mutated ONLY by Admin)
  app.get('/api/exams', requireAuth, (_req, res) => {
    const db = loadDatabase();
    const sorted = [...db.exams].sort((a, b) => a.subjectNumber - b.subjectNumber);
    res.json({ exams: sorted });
  });

  app.post('/api/exams', requireAuth, requireAdmin, (req, res) => {
    const { code, name, questionCount, kkm, pgWeight, essayWeight, answerKey } = req.body ?? {};
    const cleanName = String(name ?? '').trim().slice(0, 80);
    const cleanCode = String(code ?? '').trim().toUpperCase().slice(0, 10);
    const qCount = Math.min(50, Math.max(5, Number(questionCount) || 50));
    const cleanKkm = Math.min(100, Math.max(0, Number(kkm) || 75));
    const cleanPgWeight = Math.min(100, Math.max(10, Number(pgWeight) || 100));
    const cleanEssayWeight = Math.max(0, 100 - cleanPgWeight);

    if (!cleanName || !cleanCode) {
      res.status(400).json({ error: 'Kode dan nama mata pelajaran wajib diisi.' });
      return;
    }

    const db = loadDatabase();
    const nextNum = db.exams.reduce((max, e) => Math.max(max, e.subjectNumber), 0) + 1;
    const rawKey = Array.isArray(answerKey) ? answerKey : [];
    const normalizedKey: StoredAnswerOption[] = Array.from({ length: qCount }, (_, i) => {
      const v = String(rawKey[i] ?? 'a').toLowerCase();
      return VALID_OPTIONS.includes(v as StoredAnswerOption) ? (v as StoredAnswerOption) : 'a';
    });

    const exam = {
      id: `exam-${crypto.randomUUID().slice(0, 8)}`,
      code: cleanCode,
      subjectNumber: nextNum,
      name: cleanName,
      questionCount: qCount,
      kkm: cleanKkm,
      pgWeight: cleanPgWeight,
      essayWeight: typeof essayWeight === 'number' ? Math.max(0, 100 - cleanPgWeight) : cleanEssayWeight,
      answerKey: normalizedKey,
      updatedAt: new Date().toISOString(),
    };
    db.exams.push(exam);
    saveDatabase(db);
    res.status(201).json({ exam });
  });

  app.patch('/api/exams/:id', requireAuth, requireAdmin, (req, res) => {
    const db = loadDatabase();
    const exam = db.exams.find((e) => e.id === req.params.id);
    if (!exam) {
      res.status(404).json({ error: 'Mata pelajaran tidak ditemukan.' });
      return;
    }

    const { name, questionCount, kkm, pgWeight, answerKey } = req.body ?? {};
    if (typeof name === 'string' && name.trim()) {
      exam.name = name.trim().slice(0, 80);
    }
    if (questionCount !== undefined) {
      exam.questionCount = Math.min(50, Math.max(5, Number(questionCount) || 50));
    }
    if (kkm !== undefined) {
      exam.kkm = Math.min(100, Math.max(0, Number(kkm) || 75));
    }
    if (pgWeight !== undefined) {
      const w = Math.min(100, Math.max(10, Number(pgWeight) || 100));
      exam.pgWeight = w;
      exam.essayWeight = 100 - w;
    }
    if (Array.isArray(answerKey)) {
      exam.answerKey = Array.from({ length: exam.questionCount }, (_, i) => {
        const v = String(answerKey[i] ?? exam.answerKey[i] ?? 'a').toLowerCase();
        return VALID_OPTIONS.includes(v as StoredAnswerOption) ? (v as StoredAnswerOption) : 'a';
      });
    } else if (exam.answerKey.length !== exam.questionCount) {
      exam.answerKey = Array.from({ length: exam.questionCount }, (_, i) => exam.answerKey[i] ?? 'a');
    }

    exam.updatedAt = new Date().toISOString();
    saveDatabase(db);
    res.json({ exam });
  });

  app.delete('/api/exams/:id', requireAuth, requireAdmin, (req, res) => {
    const db = loadDatabase();
    const idx = db.exams.findIndex((e) => e.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Mata pelajaran tidak ditemukan.' });
      return;
    }
    db.exams.splice(idx, 1);
    saveDatabase(db);
    res.json({ ok: true });
  });

  // LJK Camera/Photo Optical Scan via Server-Side Gemini Vision
  app.post('/api/ljk/scan', requireAuth, async (req, res) => {
    try {
      const { imageBase64, mimeType, examId, studentId } = req.body ?? {};
      if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
        res.status(400).json({ error: 'Gambar LJK tidak valid atau kosong.' });
        return;
      }

      const db = loadDatabase();
      const exam = db.exams.find((e) => e.id === examId);
      const student = db.students.find((s) => s.id === studentId);
      if (!exam) {
        res.status(404).json({ error: 'Mata pelajaran belum dipilih atau tidak ditemukan.' });
        return;
      }
      if (!student) {
        res.status(404).json({ error: 'Siswa belum dipilih atau tidak ditemukan.' });
        return;
      }

      const cleanMime =
        mimeType === 'image/png' || mimeType === 'image/webp' ? mimeType : 'image/jpeg';
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

      const scanOut = await scanLjkImageWithGemini(cleanBase64, cleanMime, exam.questionCount);

      let correctCount = 0;
      let wrongCount = 0;
      let blankCount = 0;
      let multipleCount = 0;

      const gradedAnswers = scanOut.answers.map((item, idx) => {
        const correctAnswer = exam.answerKey[idx] ?? 'a';
        const isCorrect = item.selected === correctAnswer;
        if (isCorrect) {
          correctCount++;
        } else if (item.selected === 'kosong') {
          blankCount++;
        } else if (item.selected === 'ganda') {
          multipleCount++;
        } else {
          wrongCount++;
        }
        return {
          number: item.number,
          selected: item.selected,
          correctAnswer,
          isCorrect,
          correctedMark: item.correctedMark,
          confidence: item.confidence,
        };
      });

      const pgScore = Number(((correctCount / exam.questionCount) * 100).toFixed(2));

      res.json({
        result: {
          examId: exam.id,
          studentId: student.id,
          detectedSubject: scanOut.detectedSubject,
          detectedName: scanOut.detectedName,
          detectedClass: scanOut.detectedClass,
          detectedExamNumber: scanOut.detectedExamNumber,
          answers: gradedAnswers,
          correctCount,
          wrongCount,
          blankCount,
          multipleCount,
          pgScore,
          notes: scanOut.notes,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses pemindaian LJK.';
      res.status(500).json({ error: msg });
    }
  });

  // Scans CRUD (Guru & Admin can list and save verified scan results; Admin can delete)
  app.get('/api/scans', requireAuth, (req, res) => {
    const db = loadDatabase();
    const examId = typeof req.query.examId === 'string' ? req.query.examId : '';
    const scans = examId ? db.scans.filter((s) => s.examId === examId) : db.scans;
    const sorted = [...scans].sort(
      (a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime()
    );
    res.json({ scans: sorted });
  });

  app.post('/api/scans', requireAuth, (req: AuthenticatedRequest, res) => {
    const { studentId, examId, answers, correctedMarks, essayScore, markSynced } = req.body ?? {};
    const db = loadDatabase();
    const student = db.students.find((s) => s.id === studentId);
    const exam = db.exams.find((e) => e.id === examId);

    if (!student || !exam) {
      res.status(404).json({ error: 'Siswa atau mata pelajaran tidak valid.' });
      return;
    }
    if (!Array.isArray(answers) || answers.length !== exam.questionCount) {
      res.status(400).json({ error: `Jumlah jawaban harus tepat ${exam.questionCount} butir.` });
      return;
    }

    const normalizedAnswers: StoredScannedAnswer[] = answers.map((val) => {
      const s = String(val ?? 'kosong').toLowerCase();
      return VALID_SCANNED_VALUES.includes(s as StoredScannedAnswer)
        ? (s as StoredScannedAnswer)
        : 'kosong';
    });

    let correctCount = 0;
    let wrongCount = 0;
    let blankCount = 0;

    normalizedAnswers.forEach((ans, idx) => {
      if (ans === exam.answerKey[idx]) {
        correctCount++;
      } else if (ans === 'kosong' || ans === 'ganda') {
        blankCount++;
      } else {
        wrongCount++;
      }
    });

    const pgScore = Number(((correctCount / exam.questionCount) * 100).toFixed(2));
    const cleanEssay = Math.min(100, Math.max(0, Number(essayScore) || 0));
    const finalScore = Number(
      ((pgScore * exam.pgWeight + cleanEssay * exam.essayWeight) / 100).toFixed(2)
    );
    const passed = finalScore >= exam.kkm;

    const existingIdx = db.scans.findIndex(
      (s) => s.studentId === student.id && s.examId === exam.id
    );

    const record: StoredScanRecord = {
      id: existingIdx >= 0 ? db.scans[existingIdx].id : `scn-${crypto.randomUUID().slice(0, 8)}`,
      studentId: student.id,
      studentExamNumber: student.examNumber,
      studentName: student.name,
      studentGrade: student.grade,
      studentClassName: student.className,
      studentRoom: student.room,
      examId: exam.id,
      examName: exam.name,
      questionCount: exam.questionCount,
      answers: normalizedAnswers,
      correctedMarks: Array.isArray(correctedMarks)
        ? correctedMarks.filter((n) => typeof n === 'number')
        : [],
      correctCount,
      wrongCount,
      blankCount,
      pgScore,
      essayScore: cleanEssay,
      finalScore,
      passed,
      scannedBy: req.authUser?.username || 'guru',
      scannedByName: req.authUser?.displayName || 'Guru',
      scannedAt: new Date().toISOString(),
      syncedToSheets: Boolean(markSynced),
    };

    if (existingIdx >= 0) {
      db.scans[existingIdx] = record;
    } else {
      db.scans.push(record);
    }
    saveDatabase(db);
    res.status(201).json({ scan: record });
  });

  app.post('/api/scans/mark-synced', requireAuth, (req, res) => {
    const { examId, scanIds } = req.body ?? {};
    const db = loadDatabase();
    let updated = 0;
    for (const scan of db.scans) {
      if ((examId && scan.examId === examId) || (Array.isArray(scanIds) && scanIds.includes(scan.id))) {
        scan.syncedToSheets = true;
        updated++;
      }
    }
    saveDatabase(db);
    res.json({ updated });
  });

  app.delete('/api/scans/:id', requireAuth, requireAdmin, (req, res) => {
    const db = loadDatabase();
    const idx = db.scans.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Data hasil scan tidak ditemukan.' });
      return;
    }
    db.scans.splice(idx, 1);
    saveDatabase(db);
    res.json({ ok: true });
  });

  // Google Sheets linked configuration (shared across school users)
  app.get('/api/sheets/config', requireAuth, (_req, res) => {
    const db = loadDatabase();
    res.json({ config: db.sheetsConfig });
  });

  app.post('/api/sheets/config', requireAuth, (req: AuthenticatedRequest, res) => {
    const { spreadsheetId, spreadsheetTitle, spreadsheetUrl, synced } = req.body ?? {};
    const db = loadDatabase();
    if (typeof spreadsheetId === 'string') {
      db.sheetsConfig.spreadsheetId = spreadsheetId.trim().slice(0, 120);
    }
    if (typeof spreadsheetTitle === 'string') {
      db.sheetsConfig.spreadsheetTitle = spreadsheetTitle.trim().slice(0, 120);
    }
    if (typeof spreadsheetUrl === 'string') {
      const cleanUrl = spreadsheetUrl.trim();
      if (!cleanUrl || cleanUrl.startsWith('https://docs.google.com/spreadsheets/')) {
        db.sheetsConfig.spreadsheetUrl = cleanUrl.slice(0, 300);
      }
    }
    if (synced) {
      db.sheetsConfig.lastSyncedAt = new Date().toISOString();
      db.sheetsConfig.lastSyncedBy = req.authUser?.displayName || req.authUser?.username || 'Pengguna';
    }
    saveDatabase(db);
    res.json({ config: db.sheetsConfig });
  });

  // Vite dev middleware or static production build
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.resolve(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LJK Scan Pro server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
