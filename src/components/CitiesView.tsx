import React from 'react';
import { ArrowRight } from 'lucide-react';
import { REPRESENTATIVE_CITIES } from '../lib/cities';
import { RunItem } from '../types/run';
import { useI18n } from '../contexts/I18nContext';

interface CitiesViewProps {
  runs: RunItem[];
  onSelectCity: (cityId: string) => void;
}

export const CitiesView: React.FC<CitiesViewProps> = ({ runs, onSelectCity }) => {
  const { t, localizeCity } = useI18n();

  const countsByCity: Record<string, number> = {};
  for (const run of runs) {
    countsByCity[run.city] = (countsByCity[run.city] || 0) + 1;
  }

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Editorial Hero Banner */}
      <div className="relative rounded-2xl overflow-hidden border border-[#E5E7EB] mb-8 min-h-[220px] sm:min-h-[260px] flex items-end bg-[#111315]">
        <img
          src="/src/assets/images/editorial_sunrise_runners_1795184485832.jpg"
          alt={t('cities.title')}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/15" />
        <div className="relative z-10 p-6 sm:p-8 max-w-2xl">
          <h1 className="font-display text-2xl sm:text-4xl font-bold text-white tracking-tight">
            {t('cities.title')}
          </h1>
          <p className="mt-2 text-sm sm:text-base text-white/90 leading-relaxed">
            {t('cities.subtitle')}
          </p>
        </div>
      </div>

      {/* 9 Representative Cities Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {REPRESENTATIVE_CITIES.map((city) => {
          const count = countsByCity[city.id] || 0;
          return (
            <button
              key={city.id}
              type="button"
              onClick={() => onSelectCity(city.id)}
              className="group text-left rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden hover:border-[#111315] transition-colors flex flex-col cursor-pointer"
            >
              <div className="relative h-40 w-full overflow-hidden bg-[#1F2937]">
                <img
                  src={city.image}
                  alt={localizeCity(city.id)}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
                <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
                  <div>
                    <span className="font-mono text-[11px] text-white/80 block">
                      {city.countryCode} · {city.center.lat.toFixed(2)}, {city.center.lng.toFixed(2)}
                    </span>
                    <h2 className="font-display text-xl font-bold text-white leading-tight">
                      {localizeCity(city.id)}
                    </h2>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-4">
                <p className="text-sm text-[#57606A] leading-relaxed">
                  {t(city.taglineKey)}
                </p>
                <div className="flex items-center justify-between pt-3 border-t border-[#F3F4F6]">
                  <span className="font-mono tabular-nums text-xs font-medium text-[#111315]">
                    {count === 1
                      ? t('cities.singleRunScheduled')
                      : t('cities.runsScheduled', { count })}
                  </span>
                  <span className="text-xs font-semibold text-[#E84A27] inline-flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                    {t('cities.exploreCity')}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
