import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { applyLanguage, getStoredLanguage, type Language } from '../i18n';

/**
 * Selections that persist across screens and across visits.
 *
 * Remembering the clinic matters more on a phone than it sounds: the app is opened to
 * record one day's numbers, and re-picking the same clinic every time is the difference
 * between a two-tap task and a five-tap one.
 */

const CLINIC_KEY = 'clinic.selectedClinicId';

function readStoredClinicId(): number | null {
  try {
    const stored = localStorage.getItem(CLINIC_KEY);
    const parsed = stored ? Number(stored) : Number.NaN;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

interface AppStateValue {
  clinicId: number | null;
  setClinicId: (id: number) => void;
  year: number;
  month: number;
  setPeriod: (year: number, month: number) => void;
  stepMonth: (delta: number) => void;
  language: Language;
  setLanguage: (language: Language) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const now = new Date();

  const [clinicId, setClinicIdState] = useState<number | null>(readStoredClinicId);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [language, setLanguageState] = useState<Language>(getStoredLanguage);

  useEffect(() => {
    applyLanguage(language);
    void i18n.changeLanguage(language);
  }, [language, i18n]);

  const setClinicId = useCallback((id: number) => {
    setClinicIdState(id);
    try {
      localStorage.setItem(CLINIC_KEY, String(id));
    } catch {
      // Losing the remembered clinic is a minor inconvenience, not an error.
    }
  }, []);

  const setPeriod = useCallback((nextYear: number, nextMonth: number) => {
    setYear(nextYear);
    setMonth(nextMonth);
  }, []);

  const stepMonth = useCallback((delta: number) => {
    setMonth((current) => {
      const zeroBased = current - 1 + delta;
      const yearShift = Math.floor(zeroBased / 12);
      if (yearShift !== 0) setYear((y) => y + yearShift);
      return ((zeroBased % 12) + 12) % 12 + 1;
    });
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({
      clinicId,
      setClinicId,
      year,
      month,
      setPeriod,
      stepMonth,
      language,
      setLanguage: setLanguageState,
    }),
    [clinicId, setClinicId, year, month, setPeriod, stepMonth, language],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState must be used inside AppStateProvider');
  return value;
}
