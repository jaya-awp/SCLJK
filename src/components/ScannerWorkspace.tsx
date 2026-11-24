import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Eye,
  FileImage,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Upload,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { saveScanRecord, scanLjkImage } from '../lib/api';
import { generateFilledSampleLjkDataUrl } from '../lib/sampleLjkGenerator';
import type {
  AnswerOption,
  ScanPreviewResult,
  ScanRecord,
  ScannedAnswerValue,
  Student,
  SubjectExam,
} from '../types';
import { ConfirmModal } from './ConfirmModal';

interface ScannerWorkspaceProps {
  exams: SubjectExam[];
  students: Student[];
  scans: ScanRecord[];
  selectedExamId: string;
  onSelectExamId: (examId: string) => void;
  onScanSaved: (scan: ScanRecord) => void;
}

const OPTIONS: AnswerOption[] = ['a', 'b', 'c', 'd'];

export function ScannerWorkspace({
  exams,
  students,
  scans,
  selectedExamId,
  onSelectExamId,
  onScanSaved,
}: ScannerWorkspaceProps) {
  const [gradeFilter, setGradeFilter] = useState<'all' | '7' | '8' | '9'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');

  // Camera & image states
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [capturedImage, setCapturedImage] = useState<string>('');
  const [showReferenceSheet, setShowReferenceSheet] = useState(false);

  // Scan result & verification states
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [previewResult, setPreviewResult] = useState<ScanPreviewResult | null>(null);
  const [editableAnswers, setEditableAnswers] = useState<ScannedAnswerValue[]>([]);
  const [correctedFlags, setCorrectedFlags] = useState<number[]>([]);
  const [essayScore, setEssayScore] = useState<number>(0);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false);

  const activeExam = useMemo(
    () => exams.find((e) => e.id === selectedExamId) ?? exams[0] ?? null,
    [exams, selectedExamId]
  );

  const scannedStudentIds = useMemo(() => {
    if (!activeExam) return new Set<string>();
    return new Set(scans.filter((s) => s.examId === activeExam.id).map((s) => s.studentId));
  }, [scans, activeExam]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return students.filter((s) => {
      if (gradeFilter !== 'all' && s.grade !== gradeFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.examNumber.toLowerCase().includes(q) ||
        s.className.toLowerCase().includes(q)
      );
    });
  }, [students, gradeFilter, searchQuery]);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) ?? null,
    [students, selectedStudentId]
  );

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError('');
    setCapturedImage('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Peramban tidak mendukung akses kamera langsung. Gunakan unggah foto LJK.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => undefined);
        }
      }, 50);
    } catch {
      setCameraError(
        'Izin kamera ditolak atau tidak tersedia. Anda dapat mengunggah foto LJK dari galeri ponsel.'
      );
    }
  };

  const compressImageToJpegDataUrl = (source: HTMLVideoElement | HTMLImageElement): string => {
    const maxDim = 1600;
    const rawW =
      source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth || source.width;
    const rawH =
      source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight || source.height;
    const scale = Math.min(1, maxDim / Math.max(rawW, rawH));
    const w = Math.max(1, Math.round(rawW * scale));
    const h = Math.max(1, Math.round(rawH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(source, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.88);
  };

  const processLjkScan = async (dataUrl: string, mimeType = 'image/jpeg') => {
    if (!activeExam || !selectedStudent) {
      setScanError('Pilih mata pelajaran dan siswa terlebih dahulu sebelum memindai.');
      return;
    }
    setScanError('');
    setSaveMessage('');
    setScanning(true);
    try {
      const result = await scanLjkImage({
        imageBase64: dataUrl,
        mimeType,
        examId: activeExam.id,
        studentId: selectedStudent.id,
      });
      setPreviewResult(result);
      setEditableAnswers(result.answers.map((a) => a.selected));
      setCorrectedFlags(result.answers.filter((a) => a.correctedMark).map((a) => a.number));
      setEssayScore(0);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Gagal memindai lembar LJK.');
    } finally {
      setScanning(false);
    }
  };

  const handleCaptureCamera = async () => {
    if (!videoRef.current) return;
    const dataUrl = compressImageToJpegDataUrl(videoRef.current);
    if (!dataUrl) return;
    setCapturedImage(dataUrl);
    stopCamera();
    await processLjkScan(dataUrl, 'image/jpeg');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const compressed = compressImageToJpegDataUrl(img);
        setCapturedImage(compressed);
        stopCamera();
        await processLjkScan(compressed, 'image/jpeg');
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRunSampleScan = async () => {
    if (!activeExam || !selectedStudent) {
      setScanError('Pilih siswa terlebih dahulu untuk menjalankan simulasi pemindaian LJK.');
      return;
    }
    const sampleDataUrl = generateFilledSampleLjkDataUrl(activeExam, selectedStudent, 0.82);
    setCapturedImage(sampleDataUrl);
    stopCamera();
    await processLjkScan(sampleDataUrl, 'image/jpeg');
  };

  const liveGradingStats = useMemo(() => {
    if (!activeExam || editableAnswers.length === 0) {
      return { correct: 0, wrong: 0, blank: 0, pgScore: 0, finalScore: 0, passed: false };
    }
    let correct = 0;
    let wrong = 0;
    let blank = 0;
    editableAnswers.forEach((ans, idx) => {
      const key = activeExam.answerKey[idx];
      if (ans === key) {
        correct++;
      } else if (ans === 'kosong' || ans === 'ganda') {
        blank++;
      } else {
        wrong++;
      }
    });
    const pgScore = Number(((correct / activeExam.questionCount) * 100).toFixed(2));
    const finalScore = Number(
      ((pgScore * activeExam.pgWeight + essayScore * activeExam.essayWeight) / 100).toFixed(2)
    );
    return {
      correct,
      wrong,
      blank,
      pgScore,
      finalScore,
      passed: finalScore >= activeExam.kkm,
    };
  }, [activeExam, editableAnswers, essayScore]);

  const executeSave = async () => {
    if (!activeExam || !selectedStudent || editableAnswers.length === 0) return;
    setSaving(true);
    setScanError('');
    try {
      const saved = await saveScanRecord({
        studentId: selectedStudent.id,
        examId: activeExam.id,
        answers: editableAnswers,
        correctedMarks: correctedFlags,
        essayScore,
      });
      onScanSaved(saved);
      setSaveMessage(
        `Nilai ${saved.studentName} (${saved.finalScore}) berhasil disimpan ke rekapitulasi.`
      );
      setConfirmOverwriteOpen(false);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Gagal menyimpan hasil pemindaian.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClick = () => {
    if (!selectedStudent || !activeExam) return;
    if (scannedStudentIds.has(selectedStudent.id)) {
      setConfirmOverwriteOpen(true);
    } else {
      executeSave();
    }
  };

  const handleManualAnswerToggle = (index: number, option: AnswerOption) => {
    setEditableAnswers((prev) => {
      const next = [...prev];
      next[index] = next[index] === option ? 'kosong' : option;
      return next;
    });
  };

  // Group 1..N into columns of 10 matching physical LJK sheet
  const questionColumns = useMemo(() => {
    if (!activeExam) return [];
    const cols: number[][] = [];
    for (let start = 0; start < activeExam.questionCount; start += 10) {
      const end = Math.min(start + 10, activeExam.questionCount);
      const colItems: number[] = [];
      for (let i = start; i < end; i++) colItems.push(i);
      cols.push(colItems);
    }
    return cols;
  }, [activeExam]);

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Column: Step 1 - Pilih Mata Pelajaran & Siswa */}
      <section className="space-y-4 lg:col-span-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">01. Pilih Ujian & Siswa</h2>
          <p className="mt-1 text-xs text-slate-500">
            Data siswa dan kunci jawaban dikelola oleh Admin sekolah.
          </p>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              Mata Pelajaran
            </label>
            <select
              value={activeExam?.id || ''}
              onChange={(e) => {
                onSelectExamId(e.target.value);
                setPreviewResult(null);
                setSaveMessage('');
              }}
              className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
            >
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.subjectNumber}. {exam.name} ({exam.questionCount} soal · KKM {exam.kkm})
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-700">Filter Kelas</label>
              <span className="text-xs text-slate-500 tabular-nums">
                {scannedStudentIds.size}/{students.length} dipindai
              </span>
            </div>
            <div className="mt-1.5 grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1">
              {(['all', '7', '8', '9'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGradeFilter(g)}
                  className={`min-h-[34px] rounded-md px-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    gradeFilter === g
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {g === 'all' ? 'Semua' : `Kls ${g}`}
                </button>
              ))}
            </div>
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama atau no. peserta..."
              className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="mt-3 max-h-[380px] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {filteredStudents.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                Tidak ada siswa yang sesuai pencarian.
              </div>
            ) : (
              filteredStudents.map((stu) => {
                const isSelected = stu.id === selectedStudentId;
                const isDone = scannedStudentIds.has(stu.id);
                return (
                  <button
                    key={stu.id}
                    type="button"
                    onClick={() => {
                      setSelectedStudentId(stu.id);
                      setPreviewResult(null);
                      setSaveMessage('');
                      setScanError('');
                    }}
                    className={`flex min-h-[56px] w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors ${
                      isSelected ? 'bg-emerald-50' : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <p
                        className={`truncate text-sm font-semibold ${
                          isSelected ? 'text-emerald-900' : 'text-slate-900'
                        }`}
                      >
                        {stu.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500 tabular-nums">
                        {stu.examNumber} · Kelas {stu.className} · {stu.room}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium">
                      {isDone ? (
                        <span className="flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Selesai
                        </span>
                      ) : (
                        <span className="text-slate-400">Belum</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* Right Column: Step 2 (Camera Scanner) & Step 3 (Graded Grid) */}
      <section className="space-y-6 lg:col-span-8">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                02. Pemindai Kamera LJK
              </h2>
              {selectedStudent ? (
                <p className="mt-0.5 text-sm text-slate-600">
                  Peserta aktif:{' '}
                  <span className="font-semibold text-slate-900">{selectedStudent.name}</span>{' '}
                  <span className="text-slate-400">·</span>{' '}
                  <span className="font-mono text-xs">{selectedStudent.examNumber}</span>{' '}
                  <span className="text-slate-400">·</span> {selectedStudent.className}
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-amber-700">
                  Pilih salah satu siswa di panel kiri sebelum memindai lembar jawaban.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowReferenceSheet((prev) => !prev)}
              className="flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Eye className="h-3.5 w-3.5" />
              {showReferenceSheet ? 'Tutup Referensi LJK' : 'Lihat Format LJK'}
            </button>
          </div>

          {showReferenceSheet && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
                <p className="text-xs font-medium text-slate-700">
                  Format Lembar Jawaban ASSAS MTs Nurul Hasanah (50 Soal Pilihan Ganda 5 Kolom, tanda silang X)
                </p>
              </div>
              <img
                src="/assets/aistudio/IMG_20261123_104559_ac8dbcfe.jpg"
                alt="Referensi Lembar Jawaban LJK MTs Nurul Hasanah"
                referrerPolicy="no-referrer"
                className="mx-auto max-h-[380px] rounded-lg border border-slate-200 object-contain"
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            {!cameraActive ? (
              <button
                type="button"
                disabled={!selectedStudent}
                onClick={startCamera}
                className="flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Camera className="h-4 w-4" />
                Buka Kamera Ponsel
              </button>
            ) : (
              <button
                type="button"
                onClick={stopCamera}
                className="flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                Matikan Kamera
              </button>
            )}

            <button
              type="button"
              disabled={!selectedStudent || scanning}
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Upload className="h-4 w-4" />
              Unggah Foto LJK
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileUpload}
              className="hidden"
            />

            <button
              type="button"
              disabled={!selectedStudent || scanning}
              onClick={handleRunSampleScan}
              className="flex min-h-[44px] items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Sparkles className="h-4 w-4" />
              Uji Lembar Contoh
            </button>
          </div>

          {cameraError && (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{cameraError}</span>
            </div>
          )}

          {scanError && (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{scanError}</span>
            </div>
          )}

          {/* Camera Live Viewport or Captured Image */}
          {cameraActive && (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
              <div className="relative aspect-[4/3] w-full overflow-hidden">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />
                {/* 5-column LJK framing guide */}
                <div className="pointer-events-none absolute inset-4 rounded-lg border-2 border-dashed border-emerald-400/80">
                  <div className="grid h-full grid-cols-5 gap-2 p-3 pt-16 opacity-60">
                    {[1, 2, 3, 4, 5].map((col) => (
                      <div key={col} className="rounded border border-emerald-300/70" />
                    ))}
                  </div>
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 rounded bg-slate-900/80 px-3 py-1 text-xs font-medium text-white whitespace-nowrap">
                    Posisikan 5 kolom LJK di dalam bingkai
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center bg-slate-900 p-4">
                <button
                  type="button"
                  onClick={handleCaptureCamera}
                  disabled={scanning}
                  className="flex min-h-[48px] w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  <Camera className="h-5 w-5" />
                  Ambil Foto & Koreksi Otomatis
                </button>
              </div>
            </div>
          )}

          {!cameraActive && capturedImage && (
            <div className="mt-4 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-12">
              <div className="sm:col-span-5">
                <img
                  src={capturedImage}
                  alt="Hasil tangkapan LJK"
                  referrerPolicy="no-referrer"
                  className="max-h-56 w-full rounded-lg border border-slate-200 bg-white object-contain"
                />
              </div>
              <div className="flex flex-col justify-between sm:col-span-7">
                <div>
                  <p className="text-xs font-semibold text-slate-700">Status Pemindaian</p>
                  {scanning ? (
                    <div className="mt-2 flex items-center gap-2 text-sm text-emerald-700">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Membaca tanda silang (X) dan mencocokkan kunci jawaban...</span>
                    </div>
                  ) : previewResult ? (
                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      <p>
                        Terbaca di LJK:{' '}
                        <span className="font-medium text-slate-900">
                          {previewResult.detectedName || 'Nama tidak tertulis'}
                        </span>
                        {previewResult.detectedSubject
                          ? ` · ${previewResult.detectedSubject}`
                          : ''}
                      </p>
                      <p>{previewResult.notes || 'Pemindaian selesai.'}</p>
                      {correctedFlags.length > 0 && (
                        <p className="text-amber-700">
                          Terdeteksi coretan perbaikan jawaban pada nomor:{' '}
                          <span className="font-mono font-semibold">
                            {correctedFlags.join(', ')}
                          </span>
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">Siap diproses.</p>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={scanning}
                    onClick={() => processLjkScan(capturedImage, 'image/jpeg')}
                    className="flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Pindai Ulang Gambar Ini
                  </button>
                </div>
              </div>
            </div>
          )}

          {!cameraActive && !capturedImage && (
            <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center">
              <FileImage className="h-8 w-8 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-700">
                Siap memindai LJK pilihan ganda 1–{activeExam?.questionCount ?? 50}
              </p>
              <p className="mt-1 max-w-md text-xs text-slate-500">
                Pilih siswa di kiri, lalu buka kamera ponsel atau unggah foto lembar jawaban untuk
                koreksi otomatis tanda silang (X) beserta koreksi coretan.
              </p>
            </div>
          )}
        </div>

        {/* Step 3: Graded Answer Verification Grid */}
        {previewResult && activeExam && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  03. Hasil Koreksi & Verifikasi Jawaban
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Ketuk huruf jawaban jika ada butir soal yang perlu dikoreksi manual sebelum disimpan.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {liveGradingStats.passed ? (
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    Tuntas (KKM {activeExam.kkm})
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-red-600">
                    <XCircle className="h-4 w-4" />
                    Remedial (KKM {activeExam.kkm})
                  </span>
                )}
              </div>
            </div>

            {/* Score Summary Strip */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Benar</p>
                <p className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">
                  {liveGradingStats.correct}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Salah</p>
                <p className="mt-1 font-mono text-xl font-bold text-red-600 tabular-nums">
                  {liveGradingStats.wrong}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Kosong/Ganda</p>
                <p className="mt-1 font-mono text-xl font-bold text-amber-600 tabular-nums">
                  {liveGradingStats.blank}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Skor PG</p>
                <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
                  {liveGradingStats.pgScore}
                </p>
              </div>
              <div className="col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 sm:col-span-1">
                <p className="text-xs font-medium text-emerald-800">Nilai Akhir</p>
                <p className="mt-1 font-mono text-xl font-bold text-emerald-900 tabular-nums">
                  {liveGradingStats.finalScore}
                </p>
              </div>
            </div>

            {activeExam.essayWeight > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <label className="text-xs font-medium text-slate-700">
                  Nilai Isian / Essay (Bobot {activeExam.essayWeight}% · PG {activeExam.pgWeight}%):
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={essayScore}
                  onChange={(e) =>
                    setEssayScore(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
                  }
                  className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-sm text-slate-900 tabular-nums focus:border-emerald-600 focus:outline-none"
                />
              </div>
            )}

            {/* 5-Column Interactive LJK Answer Grid */}
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {questionColumns.map((colIndices, colIdx) => (
                <div
                  key={colIdx}
                  className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                >
                  {colIndices.map((qIdx) => {
                    const selected = editableAnswers[qIdx] ?? 'kosong';
                    const keyAns = activeExam.answerKey[qIdx];
                    const isRight = selected === keyAns;
                    const isUnclear = selected === 'kosong' || selected === 'ganda';
                    const wasCorrected = correctedFlags.includes(qIdx + 1);

                    return (
                      <div
                        key={qIdx}
                        className={`flex items-center justify-between gap-1 border-b border-slate-100 px-2 py-1.5 last:border-b-0 ${
                          isRight
                            ? 'bg-emerald-50/50'
                            : isUnclear
                            ? 'bg-amber-50/70'
                            : 'bg-red-50/50'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <span className="w-6 font-mono text-xs font-semibold text-slate-700 tabular-nums">
                            {qIdx + 1}.
                          </span>
                          {wasCorrected && (
                            <span
                              title="Siswa mencoret jawaban lama"
                              className="font-mono text-[10px] font-bold text-amber-700"
                            >
                              *
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-0.5">
                          {OPTIONS.map((opt) => {
                            const active = selected === opt;
                            const isKey = keyAns === opt;
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => handleManualAnswerToggle(qIdx, opt)}
                                title={`Kunci: ${keyAns.toUpperCase()}`}
                                className={`flex h-6 w-6 items-center justify-center rounded font-mono text-xs font-semibold uppercase transition-colors ${
                                  active
                                    ? isKey
                                      ? 'bg-emerald-700 text-white'
                                      : 'bg-red-600 text-white'
                                    : isKey
                                    ? 'border border-emerald-500 text-emerald-700 hover:bg-emerald-50'
                                    : 'text-slate-500 hover:bg-slate-200/70'
                                }`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {saveMessage && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{saveMessage}</span>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-500">
                Hijau = Benar · Merah = Salah · Bingkai Hijau = Kunci Jawaban · Tanda * = Coretan perbaikan
              </p>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveClick}
                className="flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Menyimpan...' : 'Simpan Hasil Koreksi'}
              </button>
            </div>
          </div>
        )}
      </section>

      <ConfirmModal
        open={confirmOverwriteOpen}
        title="Perbarui Hasil Scan Siswa?"
        description={`Siswa ${selectedStudent?.name ?? ''} sudah memiliki hasil pemindaian untuk mata pelajaran ${activeExam?.name ?? ''}. Simpan hasil baru dan timpa nilai sebelumnya?`}
        confirmLabel="Ya, Perbarui Nilai"
        busy={saving}
        onConfirm={executeSave}
        onCancel={() => setConfirmOverwriteOpen(false)}
      />
    </div>
  );
}
