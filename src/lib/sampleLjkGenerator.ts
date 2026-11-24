import type { AnswerOption, Student, SubjectExam } from '../types';

/**
 * Generates a realistic filled-in LJK sheet image matching the 5-column MTs Nurul Hasanah
 * ASSAS layout (with X marks and 2 scribbled corrections) so users on desktop can test the
 * automated optical scanning pipeline immediately without printing a paper sheet.
 */
export function generateFilledSampleLjkDataUrl(
  exam: SubjectExam,
  student: Student,
  accuracyRatio = 0.84
): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1100;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Paper background
  ctx.fillStyle = '#f8f8f5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Outer border
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

  // Header
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('PANITIA ASESMEN SUMATIF AKHIR SEMESTER 1 — MTs NURUL HASANAH', 48, 66);
  ctx.font = '15px sans-serif';
  ctx.fillText('LEMBAR JAWABAN ASSAS SMTR 1 • TAHUN PELAJARAN 2026/2027', 48, 92);

  // Student & Subject Info Box
  ctx.lineWidth = 1.5;
  ctx.strokeRect(48, 114, 1004, 118);
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(`MATA PELAJARAN : [${exam.subjectNumber}] ${exam.name}`, 66, 144);
  ctx.fillText(`NAMA LENGKAP   : ${student.name}`, 66, 174);
  ctx.fillText(`KELAS / RUANG  : ${student.className} / ${student.room}`, 66, 204);
  ctx.fillText(`NO. PESERTA    : ${student.examNumber}`, 620, 174);

  // Section Banner
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(48, 250, 1004, 34);
  ctx.strokeRect(48, 250, 1004, 34);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('JAWABAN PILIHAN GANDA (Tanda Silang X pada a, b, c, atau d)', 260, 272);

  const options: AnswerOption[] = ['a', 'b', 'c', 'd'];
  const colWidth = 192;
  const colGap = 11;
  const startX = 48;
  const startY = 304;
  const rowH = 52;

  for (let col = 0; col < 5; col++) {
    const cx = startX + col * (colWidth + colGap);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx, startY, colWidth, rowH * 10);

    for (let r = 0; r < 10; r++) {
      const qNum = col * 10 + r + 1;
      const ry = startY + r * rowH;

      // Row divider
      if (r > 0) {
        ctx.beginPath();
        ctx.moveTo(cx, ry);
        ctx.lineTo(cx + colWidth, ry);
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Question number
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(`${qNum}.`, cx + 10, ry + 32);

      // Decide answer to mark
      const keyOpt = exam.answerKey[qNum - 1] ?? 'a';
      const shouldBeRight = ((qNum * 17 + student.name.length) % 100) / 100 < accuracyRatio;
      const chosenOpt: AnswerOption = shouldBeRight
        ? keyOpt
        : options[(options.indexOf(keyOpt) + 1 + (qNum % 3)) % 4];
      const hasCorrection = qNum === 4 || qNum === 13;
      const wrongDraftOpt = options[(options.indexOf(chosenOpt) + 2) % 4];

      for (let oi = 0; oi < 4; oi++) {
        const opt = options[oi];
        const bx = cx + 48 + oi * 34;
        const by = ry + 10;

        // Cell divider
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, 30, 32);

        // Letter
        ctx.fillStyle = '#334155';
        ctx.font = '15px sans-serif';
        ctx.fillText(opt, bx + 10, by + 21);

        if (qNum <= exam.questionCount) {
          if (hasCorrection && opt === wrongDraftOpt) {
            // Draw X then scribble it out like the LJK example
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 2.6;
            ctx.beginPath();
            ctx.moveTo(bx + 5, by + 5);
            ctx.lineTo(bx + 25, by + 27);
            ctx.moveTo(bx + 25, by + 5);
            ctx.lineTo(bx + 5, by + 27);
            // Scribble horizontal/vertical cancellation
            ctx.moveTo(bx + 3, by + 11);
            ctx.lineTo(bx + 27, by + 11);
            ctx.moveTo(bx + 3, by + 17);
            ctx.lineTo(bx + 27, by + 17);
            ctx.moveTo(bx + 3, by + 22);
            ctx.lineTo(bx + 27, by + 22);
            ctx.moveTo(bx + 15, by + 3);
            ctx.lineTo(bx + 15, by + 29);
            ctx.stroke();
          } else if (opt === chosenOpt) {
            // Clean hand-drawn style X mark
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(bx + 5, by + 5);
            ctx.lineTo(bx + 25, by + 27);
            ctx.moveTo(bx + 25, by + 5);
            ctx.lineTo(bx + 5, by + 27);
            ctx.stroke();
          }
        }
      }
    }
  }

  return canvas.toDataURL('image/jpeg', 0.9);
}
