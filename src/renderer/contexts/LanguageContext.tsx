import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import ru from '../locales/ru';
import en from '../locales/en';

export type Lang = 'ru' | 'en';

interface LanguageContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (section: string, key: string) => string;
}

const translations: Record<Lang, any> = { ru, en };

const LanguageContext = createContext<LanguageContextType>({
  lang: 'ru',
  setLang: () => {},
  t: () => '',
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(
    () => (localStorage.getItem('lang') as Lang) || 'ru'
  );

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem('lang', l);
  }, []);

  const t = useCallback((section: string, key: string): string => {
    return translations[lang]?.[section]?.[key] ?? translations['en']?.[section]?.[key] ?? key;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}
