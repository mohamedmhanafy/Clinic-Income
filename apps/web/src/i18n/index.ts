import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ar, en } from './locales';

export type Language = 'en' | 'ar';

const STORAGE_KEY = 'clinic.language';

export function getStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'ar') return stored;
  } catch {
    // Private browsing can throw on access; the default is fine.
  }
  return 'en';
}

/**
 * Applies the language to the document. Setting `dir` on <html> is what makes the entire
 * layout mirror, because the styling uses logical properties (ms-/me-/text-start) rather
 * than left/right ones.
 */
export function applyLanguage(language: Language): void {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not being able to remember the choice is not worth failing over.
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: getStoredLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnObjects: true,
});

applyLanguage(getStoredLanguage());

export default i18n;
