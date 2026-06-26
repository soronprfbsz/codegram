import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ko from './locales/ko.json'
import en from './locales/en.json'

export const SUPPORTED_LANGUAGES = ['ko', 'en'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

const STORAGE_KEY = 'erd-lang'
/** Korean is the product's default voice. */
const DEFAULT_LANGUAGE: Language = 'ko'

function readStored(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'ko' || stored === 'en') return stored
  } catch {
    // ignore
  }
  return DEFAULT_LANGUAGE
}

i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    en: { translation: en },
  },
  lng: readStored(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
})

/** Current language (synchronous read of the live i18n instance). */
export function getLanguage(): Language {
  return (i18n.language as Language) ?? DEFAULT_LANGUAGE
}

/** Switch language and persist the choice (mirrors the theme store pattern). */
export function setLanguage(lng: Language): void {
  void i18n.changeLanguage(lng)
  try {
    localStorage.setItem(STORAGE_KEY, lng)
  } catch {
    // ignore
  }
}

export default i18n
