import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  CITY_TRANSLATIONS,
  DistanceUnit,
  Locale,
  SUPPORTED_LOCALES,
  TRANSLATIONS,
} from '../i18n/translations';

const KM_PER_MILE = 1.609344;

interface I18nContextValue {
  locale: Locale;
  bcp47: string;
  unit: DistanceUnit;
  setLocale: (locale: Locale) => void;
  setUnit: (unit: DistanceUnit) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  localizeCity: (city: string) => string;
  formatDistance: (km: number) => string;
  formatPace: (secPerKm: number) => string;
  formatRunDate: (isoString: string) => string;
  formatRunTime: (isoString: string) => string;
  formatRunDateTime: (isoString: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem('strata_locale') as Locale | null;
  if (stored && ['en', 'pt', 'es', 'fr'].includes(stored)) return stored;
  const nav = navigator.language?.slice(0, 2).toLowerCase();
  if (nav === 'pt' || nav === 'es' || nav === 'fr') return nav;
  return 'en';
}

function detectInitialUnit(): DistanceUnit {
  if (typeof window === 'undefined') return 'km';
  const stored = window.localStorage.getItem('strata_unit') as DistanceUnit | null;
  if (stored === 'km' || stored === 'mi') return stored;
  return 'km';
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale);
  const [unit, setUnitState] = useState<DistanceUnit>(detectInitialUnit);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem('strata_locale', next);
    } catch {
      // ignore storage errors
    }
  }, []);

  const setUnit = useCallback((next: DistanceUnit) => {
    setUnitState(next);
    try {
      window.localStorage.setItem('strata_unit', next);
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const bcp47 = useMemo(() => {
    return SUPPORTED_LOCALES.find((l) => l.code === locale)?.bcp47 ?? 'en-US';
  }, [locale]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const dict = TRANSLATIONS[locale] ?? TRANSLATIONS.en;
      let raw = dict[key] ?? TRANSLATIONS.en[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          raw = raw.replaceAll(`{${k}}`, String(v));
        }
      }
      return raw;
    },
    [locale],
  );

  const localizeCity = useCallback(
    (city: string) => {
      return CITY_TRANSLATIONS[city]?.[locale] ?? city;
    },
    [locale],
  );

  const formatDistance = useCallback(
    (km: number) => {
      const value = unit === 'mi' ? km / KM_PER_MILE : km;
      const formatted = new Intl.NumberFormat(bcp47, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value);
      return `${formatted} ${unit}`;
    },
    [unit, bcp47],
  );

  const formatPace = useCallback(
    (secPerKm: number) => {
      const totalSeconds = Math.round(unit === 'mi' ? secPerKm * KM_PER_MILE : secPerKm);
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')} /${unit}`;
    },
    [unit],
  );

  const formatRunDate = useCallback(
    (isoString: string) => {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat(bcp47, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(date);
    },
    [bcp47],
  );

  const formatRunTime = useCallback(
    (isoString: string) => {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat(bcp47, {
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    },
    [bcp47],
  );

  const formatRunDateTime = useCallback(
    (isoString: string) => {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat(bcp47, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    },
    [bcp47],
  );

  return (
    <I18nContext.Provider
      value={{
        locale,
        bcp47,
        unit,
        setLocale,
        setUnit,
        t,
        localizeCity,
        formatDistance,
        formatPace,
        formatRunDate,
        formatRunTime,
        formatRunDateTime,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
};

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
