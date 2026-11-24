import type {
  AnswerOption,
  ExamStatistics,
  ItemAnalysisRow,
  ScanRecord,
  SubjectExam,
} from '../types';

const OPTIONS: AnswerOption[] = ['a', 'b', 'c', 'd'];

export function computeExamStatistics(scans: ScanRecord[]): ExamStatistics {
  const n = scans.length;
  if (n === 0) {
    return {
      totalStudents: 0,
      mean: 0,
      median: 0,
      highest: 0,
      lowest: 0,
      stdDev: 0,
      passCount: 0,
      passRate: 0,
      kr20Reliability: null,
    };
  }

  const scores = scans.map((s) => s.finalScore).sort((a, b) => a - b);
  const sum = scores.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;
  const median =
    n % 2 === 0 ? (scores[n / 2 - 1] + scores[n / 2]) / 2 : scores[Math.floor(n / 2)];
  const highest = scores[n - 1];
  const lowest = scores[0];
  const variance = scores.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const passCount = scans.filter((s) => s.passed).length;
  const passRate = (passCount / n) * 100;

  // KR-20 reliability on multiple-choice raw scores (number of correct items)
  let kr20Reliability: number | null = null;
  if (n >= 3) {
    const k = scans[0].questionCount;
    const rawCounts = scans.map((s) => s.correctCount);
    const rawMean = rawCounts.reduce((a, b) => a + b, 0) / n;
    const rawVar = rawCounts.reduce((a, b) => a + (b - rawMean) ** 2, 0) / n;

    if (k > 1 && rawVar > 0) {
      let sumPq = 0;
      for (let q = 0; q < k; q++) {
        const correctForQ = scans.filter((s) => {
          const ans = s.answers[q];
          // Use per-scan score ratio if answer key matches; wait: we pass exact correctness separately below if needed.
          return ans !== 'kosong' && ans !== 'ganda';
        }).length;
        const p = correctForQ / n;
        sumPq += p * (1 - p);
      }
      // Overwritten accurately in computeItemAnalysis when answerKey is provided
      kr20Reliability = Number(((k / (k - 1)) * (1 - sumPq / rawVar)).toFixed(3));
    }
  }

  return {
    totalStudents: n,
    mean: Number(mean.toFixed(2)),
    median: Number(median.toFixed(2)),
    highest: Number(highest.toFixed(2)),
    lowest: Number(lowest.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    passCount,
    passRate: Number(passRate.toFixed(1)),
    kr20Reliability,
  };
}

export function computeItemAnalysis(
  exam: SubjectExam,
  scans: ScanRecord[]
): { rows: ItemAnalysisRow[]; stats: ExamStatistics } {
  const stats = computeExamStatistics(scans);
  const n = scans.length;
  const k = exam.questionCount;

  if (n === 0) {
    return { rows: [], stats };
  }

  // Sort students descending by PG score for upper/lower discrimination groups
  const sortedByScore = [...scans].sort((a, b) => b.correctCount - a.correctCount);
  const groupSize = n >= 10 ? Math.max(2, Math.round(n * 0.27)) : Math.max(1, Math.floor(n / 2));
  const upperGroup = sortedByScore.slice(0, groupSize);
  const lowerGroup = sortedByScore.slice(n - groupSize);

  let sumPq = 0;
  const rawCounts = scans.map((s) => s.correctCount);
  const rawMean = rawCounts.reduce((a, b) => a + b, 0) / n;
  const rawVar = rawCounts.reduce((a, b) => a + (b - rawMean) ** 2, 0) / n;

  const rows: ItemAnalysisRow[] = [];

  for (let i = 0; i < k; i++) {
    const correctAns = exam.answerKey[i] ?? 'a';
    const optionCounts = { a: 0, b: 0, c: 0, d: 0, other: 0 };
    let correctCount = 0;
    let wrongCount = 0;
    let blankOrMultipleCount = 0;

    for (const scan of scans) {
      const sel = scan.answers[i] ?? 'kosong';
      if (sel === 'a' || sel === 'b' || sel === 'c' || sel === 'd') {
        optionCounts[sel]++;
        if (sel === correctAns) {
          correctCount++;
        } else {
          wrongCount++;
        }
      } else {
        optionCounts.other++;
        blankOrMultipleCount++;
      }
    }

    const p = correctCount / n;
    sumPq += p * (1 - p);

    const difficultyLabel: ItemAnalysisRow['difficultyLabel'] =
      p < 0.3 ? 'Sukar' : p <= 0.7 ? 'Sedang' : 'Mudah';

    let upperCorrect = 0;
    for (const s of upperGroup) {
      if (s.answers[i] === correctAns) upperCorrect++;
    }
    let lowerCorrect = 0;
    for (const s of lowerGroup) {
      if (s.answers[i] === correctAns) lowerCorrect++;
    }

    const d =
      n >= 2 ? upperCorrect / upperGroup.length - lowerCorrect / lowerGroup.length : 0;

    const discriminationLabel: ItemAnalysisRow['discriminationLabel'] =
      d >= 0.4 ? 'Baik Sekali' : d >= 0.3 ? 'Baik' : d >= 0.2 ? 'Cukup' : 'Jelek';

    // Distractor analysis: flag wrong options selected by < 5% (or 0 students when n >= 4)
    const minDistractorCount = n >= 20 ? Math.ceil(n * 0.05) : 1;
    const ineffectiveDistractors = OPTIONS.filter(
      (opt) => opt !== correctAns && optionCounts[opt] < minDistractorCount
    );

    let recommendation: ItemAnalysisRow['recommendation'] = 'Pertahankan';
    if (n >= 2) {
      if (d < 0.2 && (p < 0.2 || p > 0.85)) {
        recommendation = 'Buang / Ganti';
      } else if (d < 0.2) {
        recommendation = 'Revisi Soal';
      } else if (ineffectiveDistractors.length > 0 && d < 0.3) {
        recommendation = 'Revisi Pengecoh';
      }
    }

    rows.push({
      questionNumber: i + 1,
      correctAnswer: correctAns,
      totalResponses: n,
      correctCount,
      wrongCount,
      blankOrMultipleCount,
      difficultyIndex: Number(p.toFixed(2)),
      difficultyLabel,
      discriminationIndex: Number(d.toFixed(2)),
      discriminationLabel,
      optionCounts,
      ineffectiveDistractors,
      recommendation,
    });
  }

  if (n >= 3 && k > 1 && rawVar > 0) {
    const kr20 = (k / (k - 1)) * (1 - sumPq / rawVar);
    stats.kr20Reliability = Number(Math.max(-1, Math.min(1, kr20)).toFixed(3));
  } else {
    stats.kr20Reliability = null;
  }

  return { rows, stats };
}
