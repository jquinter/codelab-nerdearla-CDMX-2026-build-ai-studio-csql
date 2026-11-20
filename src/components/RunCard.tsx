import React from 'react';
import { Check, MapPin, Users, ArrowUpRight, Loader2 } from 'lucide-react';
import { RunItem } from '../types/run';
import { useI18n } from '../contexts/I18nContext';

interface RunCardProps {
  run: RunItem;
  isSelected: boolean;
  isRsvpPending: boolean;
  onSelect: (run: RunItem) => void;
  onOpenDetail: (run: RunItem) => void;
  onToggleRsvp: (run: RunItem) => void;
}

export const RunCard: React.FC<RunCardProps> = ({
  run,
  isSelected,
  isRsvpPending,
  onSelect,
  onOpenDetail,
  onToggleRsvp,
}) => {
  const { t, localizeCity, formatDistance, formatPace, formatRunDate, formatRunTime } = useI18n();

  return (
    <article
      onClick={() => onSelect(run)}
      className={`group rounded-2xl border p-4 sm:p-5 transition-colors cursor-pointer ${
        isSelected
          ? 'bg-white border-[#111315] shadow-sm'
          : 'bg-white border-[#E5E7EB] hover:border-[#9CA3AF]'
      }`}
    >
      {/* Top quiet unboxed metadata line */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#57606A]">
        <span className="font-semibold text-[#111315]">{localizeCity(run.city)}</span>
        <span aria-hidden="true">·</span>
        <span className="font-mono tabular-nums">{formatRunDate(run.startsAt)}</span>
        <span aria-hidden="true">·</span>
        <span className="font-mono tabular-nums">{formatRunTime(run.startsAt)}</span>
        <span aria-hidden="true">·</span>
        <span>{t(`paceGroup.${run.paceGroup}`)}</span>
      </div>

      {/* Title */}
      <div className="mt-2 flex items-start justify-between gap-3">
        <h3 className="font-display text-base sm:text-lg font-semibold text-[#111315] leading-snug">
          {run.title}
        </h3>
        {run.isHost && (
          <span className="text-[11px] font-medium text-[#E84A27] shrink-0 whitespace-nowrap pt-0.5">
            {t('profile.hosting')}
          </span>
        )}
      </div>

      {/* Meeting point */}
      <p className="mt-1.5 flex items-center gap-1.5 text-xs sm:text-sm text-[#57606A] truncate">
        <MapPin className="w-3.5 h-3.5 text-[#8C959F] shrink-0" />
        <span className="truncate">{run.meetingPoint}</span>
      </p>

      {/* Key tabular metrics row */}
      <div className="mt-4 pt-3.5 border-t border-[#F3F4F6] grid grid-cols-3 gap-2">
        <div>
          <span className="block text-[11px] text-[#57606A]">{t('filters.distance')}</span>
          <span className="font-mono tabular-nums text-sm font-semibold text-[#111315]">
            {formatDistance(run.distanceKm)}
          </span>
        </div>
        <div>
          <span className="block text-[11px] text-[#57606A]">{t('filters.pace')}</span>
          <span className="font-mono tabular-nums text-sm font-semibold text-[#111315]">
            {formatPace(run.paceSecPerKm)}
          </span>
        </div>
        <div>
          <span className="block text-[11px] text-[#57606A]">{t(`surface.${run.surfaceType}`)}</span>
          <span className="font-mono tabular-nums text-sm font-semibold text-[#111315] inline-flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-[#57606A]" />
            {run.attendeeCount}/{run.maxRunners}
          </span>
        </div>
      </div>

      {/* Actions footer */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail(run);
          }}
          className="min-h-[40px] sm:min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium text-[#111315] bg-[#F3F4F6] hover:bg-[#E5E7EB] transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
        >
          <span>{t('run.viewDetails')}</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          disabled={isRsvpPending}
          onClick={(e) => {
            e.stopPropagation();
            onToggleRsvp(run);
          }}
          className={`min-h-[40px] sm:min-h-[38px] px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60 ${
            run.isJoined
              ? 'bg-[#15803D]/10 text-[#15803D] border border-[#15803D]/30 hover:bg-[#15803D]/15'
              : 'bg-[#111315] text-white hover:bg-[#E84A27]'
          }`}
        >
          {isRsvpPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : run.isJoined ? (
            <Check className="w-3.5 h-3.5" />
          ) : null}
          <span>{run.isJoined ? t('run.joined') : t('run.join')}</span>
        </button>
      </div>
    </article>
  );
};
