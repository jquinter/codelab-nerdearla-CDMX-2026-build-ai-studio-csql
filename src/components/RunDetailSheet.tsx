import React, { useState } from 'react';
import {
  Calendar,
  Check,
  Clock,
  Loader2,
  MapPin,
  Route,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { RunItem } from '../types/run';
import { useI18n } from '../contexts/I18nContext';

interface RunDetailSheetProps {
  run: RunItem | null;
  isRsvpPending: boolean;
  isDeletePending: boolean;
  onClose: () => void;
  onToggleRsvp: (run: RunItem) => void;
  onDeleteRun: (run: RunItem) => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

export const RunDetailSheet: React.FC<RunDetailSheetProps> = ({
  run,
  isRsvpPending,
  isDeletePending,
  onClose,
  onToggleRsvp,
  onDeleteRun,
}) => {
  const { t, localizeCity, formatDistance, formatPace, formatRunDate, formatRunTime } = useI18n();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (!run) return null;

  const spotsRemaining = Math.max(0, run.maxRunners - run.attendeeCount);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-stretch lg:justify-end bg-black/40 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={run.title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full lg:max-w-lg bg-white rounded-t-3xl lg:rounded-none lg:rounded-l-2xl max-h-[90vh] lg:max-h-full lg:h-full flex flex-col shadow-2xl border-t lg:border-t-0 lg:border-l border-[#E5E7EB]"
      >
        {/* Mobile grab handle */}
        <div className="lg:hidden pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-[#D1D5DB]" />
        </div>

        {/* Sheet Header */}
        <div className="px-5 sm:px-6 pt-3 pb-4 border-b border-[#E5E7EB] flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#57606A]">
              <span className="font-semibold text-[#111315]">{localizeCity(run.city)}</span>
              <span aria-hidden="true">·</span>
              <span>{t(`paceGroup.${run.paceGroup}`)}</span>
              <span aria-hidden="true">·</span>
              <span>{t(`surface.${run.surfaceType}`)}</span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#111315] mt-1 leading-tight">
              {run.title}
            </h2>
            <p className="text-xs text-[#57606A] mt-1">
              {t('run.hostedBy', { name: run.host.displayName })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-1 flex items-center justify-center rounded-xl text-[#57606A] hover:text-[#111315] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
          {/* Core stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-5 border-b border-[#E5E7EB]">
            <div>
              <span className="text-[11px] text-[#57606A] flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {t('composer.date')}
              </span>
              <p className="font-mono tabular-nums text-sm font-semibold text-[#111315] mt-1">
                {formatRunDate(run.startsAt)}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-[#57606A] flex items-center gap-1">
                <Clock className="w-3 h-3" /> {t('composer.time')}
              </span>
              <p className="font-mono tabular-nums text-sm font-semibold text-[#111315] mt-1">
                {formatRunTime(run.startsAt)}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-[#57606A]">{t('filters.distance')}</span>
              <p className="font-mono tabular-nums text-sm font-semibold text-[#111315] mt-1">
                {formatDistance(run.distanceKm)}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-[#57606A]">{t('filters.pace')}</span>
              <p className="font-mono tabular-nums text-sm font-semibold text-[#111315] mt-1">
                {formatPace(run.paceSecPerKm)}
              </p>
            </div>
          </div>

          {/* Meeting point */}
          <div>
            <h3 className="text-xs font-semibold text-[#57606A] flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#E84A27]" />
              {t('run.meetingPoint')}
            </h3>
            <p className="mt-1.5 text-sm font-medium text-[#111315]">{run.meetingPoint}</p>
            <p className="mt-0.5 font-mono tabular-nums text-xs text-[#57606A]">
              {run.startLat.toFixed(4)}, {run.startLng.toFixed(4)}
            </p>
          </div>

          {/* Notes */}
          {run.description && (
            <div>
              <h3 className="text-xs font-semibold text-[#57606A]">{t('run.notes')}</h3>
              <p className="mt-1.5 text-sm text-[#374151] leading-relaxed whitespace-pre-line">
                {run.description}
              </p>
            </div>
          )}

          {/* Waypoints list */}
          {run.waypoints && run.waypoints.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[#57606A] flex items-center gap-1.5">
                <Route className="w-3.5 h-3.5 text-[#E84A27]" />
                {t('run.routeOverview')} ({run.waypoints.length + 1})
              </h3>
              <ol className="mt-2.5 space-y-2">
                <li className="flex items-center gap-2.5 text-xs text-[#111315]">
                  <span className="w-5 h-5 rounded-full bg-[#E84A27] text-white font-mono text-[10px] font-semibold flex items-center justify-center shrink-0">
                    S
                  </span>
                  <span className="font-medium truncate">{run.meetingPoint}</span>
                </li>
                {run.waypoints.map((wp, idx) => (
                  <li key={idx} className="flex items-center gap-2.5 text-xs text-[#374151]">
                    <span className="w-5 h-5 rounded-full bg-[#F3F4F6] text-[#111315] border border-[#D1D5DB] font-mono text-[10px] font-semibold flex items-center justify-center shrink-0">
                      {idx === run.waypoints.length - 1 ? 'F' : idx + 1}
                    </span>
                    <span className="truncate">
                      {wp.label || `${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}`}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Live Attendee Roster */}
          <div className="pt-2 border-t border-[#E5E7EB]">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#57606A] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {t('run.attendees', { count: run.attendeeCount })}
              </h3>
              <span className="font-mono tabular-nums text-xs text-[#57606A]">
                {t('run.spotsLeft', { count: spotsRemaining })}
              </span>
            </div>

            {run.attendees.length === 0 ? (
              <p className="mt-3 text-sm text-[#57606A]">{t('run.noAttendees')}</p>
            ) : (
              <ul className="mt-3 divide-y divide-[#F3F4F6]">
                {run.attendees.map((runner) => (
                  <li key={runner.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {runner.avatarUrl ? (
                        <img
                          src={runner.avatarUrl}
                          alt={runner.displayName}
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded-full object-cover border border-[#E5E7EB] shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[#F3F4F6] border border-[#E5E7EB] text-[#111315] text-xs font-semibold flex items-center justify-center shrink-0">
                          {getInitials(runner.displayName)}
                        </div>
                      )}
                      <span className="text-sm font-medium text-[#111315] truncate">
                        {runner.displayName}
                      </span>
                    </div>
                    {runner.uid === run.host.uid && (
                      <span className="text-xs text-[#E84A27] font-medium shrink-0">
                        {t('profile.hosting')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Sticky Footer CTA */}
        <div className="px-5 sm:px-6 py-4 border-t border-[#E5E7EB] bg-white pb-safe flex flex-wrap items-center justify-between gap-3">
          {run.isHost ? (
            confirmingDelete ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isDeletePending}
                  onClick={() => onDeleteRun(run)}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#B91C1C] text-white text-xs font-semibold hover:bg-[#991B1B] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60"
                >
                  {isDeletePending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {t('run.confirmCancel')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium text-[#57606A] hover:bg-[#F3F4F6] transition-colors whitespace-nowrap cursor-pointer"
                >
                  {t('run.keepRun')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium text-[#B91C1C] hover:bg-[#FEF2F2] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                {t('run.cancelRun')}
              </button>
            )
          ) : (
            <div />
          )}

          <button
            type="button"
            disabled={isRsvpPending}
            onClick={() => onToggleRsvp(run)}
            className={`min-h-[44px] flex-1 sm:flex-none sm:min-w-[180px] px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-60 ${
              run.isJoined
                ? 'bg-[#F3F4F6] text-[#111315] hover:bg-[#E5E7EB] border border-[#D1D5DB]'
                : 'bg-[#E84A27] text-white hover:bg-[#D13F1E]'
            }`}
          >
            {isRsvpPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : run.isJoined ? (
              <Check className="w-4 h-4 text-[#15803D]" />
            ) : null}
            <span>{run.isJoined ? t('run.leave') : t('run.join')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
