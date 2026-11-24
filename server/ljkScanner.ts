import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { StoredScannedAnswer } from './store.ts';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export interface RawScannedItem {
  number: number;
  selected: StoredScannedAnswer;
  correctedMark: boolean;
  confidence: 'high' | 'medium' | 'low';
}

export interface RawLjkScanOutput {
  detectedSubject: string;
  detectedName: string;
  detectedClass: string;
  detectedExamNumber: string;
  notes: string;
  answers: RawScannedItem[];
}

export async function scanLjkImageWithGemini(
  base64Data: string,
  mimeType: string,
  questionCount: number
): Promise<RawLjkScanOutput> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi pada server.');
  }

  const prompt = `Anda adalah sistem OMR (Optical Mark Recognition) presisi tinggi untuk Lembar Jawaban Komputer (LJK) berbentuk tanda silang (X).
Layout LJK standar terdiri dari:
- Bagian atas kiri: MATA PELAJARAN (1–15, misalnya Al-Qur'an Hadits, PPKn, B. Indonesia, B. Inggris, Matematika, IPA, IPS, Seni Budaya, Akidah Akhlak, SKI, Bahasa Arab, Muatan Lokal/B. Sunda, Fiqih, Informatika, PJOK).
- Bagian atas kanan: IDENTITAS DIRI (Nama Lengkap, Kelas 7/8/9, Ruang, No. Peserta Ujian).
- Bagian utama: JAWABAN PILIHAN GANDA sebanyak 50 nomor yang disusun dalam 5 kolom vertikal (Kolom 1: soal 1-10, Kolom 2: soal 11-20, Kolom 3: soal 21-30, Kolom 4: soal 31-40, Kolom 5: soal 41-50). Setiap baris soal memiliki 4 kotak huruf: a, b, c, d.

ATURAN BACA TANDA SILANG (X):
1. Baca tepat dari nomor 1 sampai nomor ${questionCount}.
2. Jawaban valid ditandai dengan tanda silang (X), centang, atau arsiran/lingkaran jelas pada tepat satu kotak huruf (a, b, c, atau d).
3. Jika ada huruf yang awalnya diberi X lalu DICORET rapat / ditimpa coretan pembatalan (misalnya seperti garis horizontal/vertikal/zig-zag rapat menimpa X), dan ada huruf lain yang memiliki tanda X bersih, maka pilih huruf yang bertanda X bersih tersebut dan set correctedMark = true.
4. Jika semua kotak a, b, c, d pada satu nomor benar-benar kosong tanpa tanda, isi selected = "kosong".
5. Jika terdapat 2 atau lebih kotak yang memiliki tanda X bersih tanpa coretan pembatalan, isi selected = "ganda".
6. Pastikan array answers berisi tepat ${questionCount} item berurutan dari number 1 hingga ${questionCount}.
7. Catat pada notes jika gambar blur, miring, pencahayaan kurang, atau jika seluruh lembar masih kosong.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text: prompt,
        },
      ],
    },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          detectedSubject: {
            type: Type.STRING,
            description: 'Mata pelajaran yang ditandai atau terbaca pada lembar LJK, kosongkan string jika tidak terbaca.',
          },
          detectedName: {
            type: Type.STRING,
            description: 'Nama lengkap peserta yang tertulis di kolom Identitas Diri, kosongkan string jika tidak tertulis.',
          },
          detectedClass: {
            type: Type.STRING,
            description: 'Kelas yang tertulis atau dilingkari pada lembar LJK.',
          },
          detectedExamNumber: {
            type: Type.STRING,
            description: 'Nomor peserta ujian yang tertulis pada lembar LJK.',
          },
          notes: {
            type: Type.STRING,
            description: 'Catatan singkat kondisi lembar LJK (misal jelas, perlu tinjauan, atau lembar kosong).',
          },
          answers: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                number: { type: Type.INTEGER },
                selected: {
                  type: Type.STRING,
                  enum: ['a', 'b', 'c', 'd', 'kosong', 'ganda'],
                },
                correctedMark: { type: Type.BOOLEAN },
                confidence: {
                  type: Type.STRING,
                  enum: ['high', 'medium', 'low'],
                },
              },
              required: ['number', 'selected', 'correctedMark', 'confidence'],
            },
          },
        },
        required: [
          'detectedSubject',
          'detectedName',
          'detectedClass',
          'detectedExamNumber',
          'notes',
          'answers',
        ],
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as Partial<RawLjkScanOutput>;

  const answerMap = new Map<number, RawScannedItem>();
  if (Array.isArray(parsed.answers)) {
    for (const item of parsed.answers) {
      if (
        typeof item?.number === 'number' &&
        item.number >= 1 &&
        item.number <= questionCount
      ) {
        const validChoice: StoredScannedAnswer =
          item.selected === 'a' ||
          item.selected === 'b' ||
          item.selected === 'c' ||
          item.selected === 'd' ||
          item.selected === 'ganda'
            ? item.selected
            : 'kosong';
        const validConf =
          item.confidence === 'high' || item.confidence === 'medium' || item.confidence === 'low'
            ? item.confidence
            : 'medium';
        answerMap.set(item.number, {
          number: item.number,
          selected: validChoice,
          correctedMark: Boolean(item.correctedMark),
          confidence: validConf,
        });
      }
    }
  }

  const normalizedAnswers: RawScannedItem[] = [];
  for (let i = 1; i <= questionCount; i++) {
    normalizedAnswers.push(
      answerMap.get(i) ?? {
        number: i,
        selected: 'kosong',
        correctedMark: false,
        confidence: 'low',
      }
    );
  }

  return {
    detectedSubject: typeof parsed.detectedSubject === 'string' ? parsed.detectedSubject.trim() : '',
    detectedName: typeof parsed.detectedName === 'string' ? parsed.detectedName.trim() : '',
    detectedClass: typeof parsed.detectedClass === 'string' ? parsed.detectedClass.trim() : '',
    detectedExamNumber: typeof parsed.detectedExamNumber === 'string' ? parsed.detectedExamNumber.trim() : '',
    notes: typeof parsed.notes === 'string' ? parsed.notes.trim() : '',
    answers: normalizedAnswers,
  };
}
