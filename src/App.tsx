import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  FileSpreadsheet,
  KeyRound,
  LogOut,
  ScanLine,
  Users,
} from 'lucide-react';
import { AdminExamsAndUsersView } from './components/AdminExamsAndUsersView';
import { AdminStudentsView } from './components/AdminStudentsView';
import { AuthGate } from './components/AuthGate';
import { ItemAnalysisView } from './components/ItemAnalysisView';
import { RecapView } from './components/RecapView';
import { ScannerWorkspace } from './components/ScannerWorkspace';
import {
  fetchAuthStatus,
  fetchExams,
  fetchScans,
  fetchSheetsConfig,
  fetchStudents,
  setAuthToken,
} from './lib/api';
import { initGoogleAuth } from './lib/googleAuth';
import type { AuthUser, ScanRecord, SheetsConfig, Student, SubjectExam } from './types';

type NavTab = 'scanner' | 'recap' | 'analysis' | 'students' | 'admin';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [hasEnvAdmin, setHasEnvAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('scanner');
  const [exams, setExams] = useState<SubjectExam[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [sheetsConfig, setSheetsConfig] = useState<SheetsConfig>({
    spreadsheetId: '',
    spreadsheetTitle: '',
    spreadsheetUrl: '',
    lastSyncedAt: null,
    lastSyncedBy: null,
  });

  // Google Sheets OAuth token cached strictly in React state/memory
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);

  useEffect(() => {
    fetchAuthStatus()
      .then((status) => {
        setNeedsSetup(!status.adminConfigured);
        setHasEnvAdmin(status.hasEnvAdmin);
      })
      .catch(() => undefined)
      .finally(() => setBooting(false));

    const unsubscribe = initGoogleAuth(
      (gUser, token) => {
        setGoogleToken(token);
        setGoogleEmail(gUser.email ?? 'Akun Google');
      },
      () => {
        setGoogleToken(null);
        setGoogleEmail(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    try {
      const [examList, studentList, scanList, sheetCfg] = await Promise.all([
        fetchExams(),
        fetchStudents(),
        fetchScans(),
        fetchSheetsConfig(),
      ]);
      setExams(examList);
      setStudents(studentList);
      setScans(scanList);
      setSheetsConfig(sheetCfg);
      setSelectedExamId((prev) =>
        prev && examList.some((e) => e.id === prev) ? prev : examList[0]?.id ?? ''
      );
    } catch {
      // Handled by empty state / auth reset
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadWorkspaceData();
    }
  }, [currentUser, loadWorkspaceData]);

  const handleLogout = () => {
    setAuthToken(null);
    setCurrentUser(null);
    setActiveTab('scanner');
  };

  const navItems = useMemo(() => {
    const base: Array<{ id: NavTab; label: string; icon: typeof ScanLine }> = [
      { id: 'scanner', label: 'Scanner', icon: ScanLine },
      { id: 'recap', label: 'Rekap Nilai', icon: FileSpreadsheet },
      { id: 'analysis', label: 'Analisis Soal', icon: BarChart3 },
    ];
    if (currentUser?.role === 'admin') {
      base.push(
        { id: 'students', label: 'Data Siswa', icon: Users },
        { id: 'admin', label: 'Kunci & Akun', icon: KeyRound }
      );
    }
    return base;
  }, [currentUser]);

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        Memuat LJK Scan Pro...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthGate
        needsSetup={needsSetup}
        hasEnvAdmin={hasEnvAdmin}
        onAuthenticated={(user) => setCurrentUser(user)}
        onSetupComplete={() => setNeedsSetup(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-8">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('scanner')}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            LJK Scan Pro
          </button>

          {/* Zone 2: Concise single-line desktop nav links */}
          <nav className="hidden md:flex items-center gap-6" aria-label="Navigasi utama">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`border-b-2 py-5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-emerald-700 text-emerald-800'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Account Identity & Single Action */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-xs font-medium text-slate-600 whitespace-nowrap">
              {currentUser.displayName} ·{' '}
              <span className="uppercase text-emerald-700">{currentUser.role}</span>
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
              Keluar
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {activeTab === 'scanner' && (
          <ScannerWorkspace
            exams={exams}
            students={students}
            scans={scans}
            selectedExamId={selectedExamId}
            onSelectExamId={setSelectedExamId}
            onScanSaved={() => {
              fetchScans().then(setScans).catch(() => undefined);
            }}
          />
        )}

        {activeTab === 'recap' && (
          <RecapView
            currentUser={currentUser}
            exams={exams}
            students={students}
            scans={scans}
            selectedExamId={selectedExamId}
            onSelectExamId={setSelectedExamId}
            sheetsConfig={sheetsConfig}
            onSheetsConfigUpdated={setSheetsConfig}
            googleToken={googleToken}
            googleUserEmail={googleEmail}
            onGoogleAuthChanged={(token, email) => {
              setGoogleToken(token);
              setGoogleEmail(email);
            }}
            onScansChanged={() => {
              fetchScans().then(setScans).catch(() => undefined);
            }}
          />
        )}

        {activeTab === 'analysis' && (
          <ItemAnalysisView
            exams={exams}
            scans={scans}
            selectedExamId={selectedExamId}
            onSelectExamId={setSelectedExamId}
          />
        )}

        {activeTab === 'students' && currentUser.role === 'admin' && (
          <AdminStudentsView
            students={students}
            onStudentsChanged={() => {
              fetchStudents().then(setStudents).catch(() => undefined);
            }}
          />
        )}

        {activeTab === 'admin' && currentUser.role === 'admin' && (
          <AdminExamsAndUsersView
            currentUser={currentUser}
            exams={exams}
            selectedExamId={selectedExamId}
            onSelectExamId={setSelectedExamId}
            onExamsChanged={() => {
              fetchExams().then(setExams).catch(() => undefined);
            }}
          />
        )}
      </main>

      {/* Mobile Thumb-Zone Bottom Tab Bar (Compact <= 15% height) */}
      <nav
        className="fixed right-0 bottom-0 left-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden pb-safe"
        aria-label="Navigasi seluler"
      >
        <div
          className="grid h-16 items-center"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex min-h-[44px] flex-col items-center justify-center px-1 text-[10px] font-medium tracking-tight ${
                  active ? 'text-emerald-700' : 'text-slate-500'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="mt-1 truncate max-w-full">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
