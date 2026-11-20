import React, { useCallback, useState } from 'react';
import { Loader2, RotateCcw, Trash2, CornerDownLeft, X, MapPin } from 'lucide-react';
import { RouteWaypoint } from '../types/run';
import { useI18n } from '../contexts/I18nContext';
import { REPRESENTATIVE_CITIES } from '../lib/cities';
import { PlaceSearchInput, SelectedPlaceResult } from './PlaceSearchInput';
import { RouteBuilderMap } from './RouteBuilderMap';

const KM_PER_MILE = 1.609344;

export interface PostRunFormValues {
  title: string;
  city: string;
  countryCode: string;
  startsAt: string;
  distanceKm: number;
  paceSecPerKm: number;
  paceGroup: 'social' | 'tempo' | 'threshold' | 'long';
  surfaceType: 'road' | 'park' | 'trail' | 'waterfront';
  meetingPoint: string;
  description: string;
  startLat: number;
  startLng: number;
  waypoints: RouteWaypoint[];
  maxRunners: number;
}

interface PostRunModalProps {
  isOpen: boolean;
  hasMapsApiKey: boolean;
  defaultCity?: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: PostRunFormValues) => Promise<void>;
}

function getDefaultDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const PostRunModal: React.FC<PostRunModalProps> = ({
  isOpen,
  hasMapsApiKey,
  defaultCity,
  isSubmitting,
  onClose,
  onSubmit,
}) => {
  const { t, locale, unit, localizeCity } = useI18n();

  const initialPreset =
    REPRESENTATIVE_CITIES.find((c) => c.id === defaultCity) || REPRESENTATIVE_CITIES[0];

  const [title, setTitle] = useState('');
  const [city, setCity] = useState(initialPreset.id);
  const [countryCode, setCountryCode] = useState(initialPreset.countryCode);
  const [dateStr, setDateStr] = useState(getDefaultDateString);
  const [timeStr, setTimeStr] = useState('07:30');
  const [paceGroup, setPaceGroup] = useState<PostRunFormValues['paceGroup']>('social');
  const [surfaceType, setSurfaceType] = useState<PostRunFormValues['surfaceType']>('park');
  const [paceMin, setPaceMin] = useState(unit === 'mi' ? '8' : '5');
  const [paceSec, setPaceSec] = useState('15');
  const [distanceInput, setDistanceInput] = useState(unit === 'mi' ? '5.0' : '8.0');
  const [meetingPoint, setMeetingPoint] = useState('');
  const [description, setDescription] = useState('');
  const [maxRunners, setMaxRunners] = useState('35');

  const [mapCenter, setMapCenter] = useState(initialPreset.center);
  const [startPoint, setStartPoint] = useState<{ lat: number; lng: number } | null>(
    initialPreset.center,
  );
  const [waypoints, setWaypoints] = useState<RouteWaypoint[]>([]);
  const [routeModeLabel, setRouteModeLabel] = useState<'idle' | 'live' | 'fallback'>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  const handleCitySelect = (nextCityId: string) => {
    setCity(nextCityId);
    const preset = REPRESENTATIVE_CITIES.find((c) => c.id === nextCityId);
    if (preset) {
      setCountryCode(preset.countryCode);
      setMapCenter(preset.center);
      setStartPoint(preset.center);
      setWaypoints([]);
      setRouteModeLabel('idle');
    }
  };

  const handlePlaceSelect = useCallback((place: SelectedPlaceResult) => {
    setMapCenter({ lat: place.lat, lng: place.lng });
    setStartPoint({ lat: place.lat, lng: place.lng });
    setWaypoints([]);
    setRouteModeLabel('idle');
    if (place.city) {
      const matched = REPRESENTATIVE_CITIES.find(
        (c) => c.id.toLowerCase() === place.city?.toLowerCase(),
      );
      setCity(matched ? matched.id : place.city);
    }
    if (place.countryCode) {
      setCountryCode(place.countryCode);
    }
  }, []);

  const handleMapClick = useCallback(
    (coords: { lat: number; lng: number }) => {
      if (!startPoint) {
        setStartPoint(coords);
        return;
      }
      setWaypoints((prev) => [
        ...prev,
        {
          lat: coords.lat,
          lng: coords.lng,
          label: `Point ${prev.length + 1}`,
        },
      ]);
    },
    [startPoint],
  );

  const handleDistanceComputed = useCallback(
    (km: number, mode: 'live' | 'fallback') => {
      const displayVal = unit === 'mi' ? km / KM_PER_MILE : km;
      setDistanceInput(displayVal.toFixed(1));
      setRouteModeLabel(mode);
    },
    [unit],
  );

  const handleUndoPoint = () => {
    setWaypoints((prev) => prev.slice(0, -1));
  };

  const handleCloseLoop = () => {
    if (!startPoint || waypoints.length === 0) return;
    setWaypoints((prev) => [
      ...prev,
      {
        lat: startPoint.lat,
        lng: startPoint.lng,
        label: meetingPoint || t('run.finishLabel'),
      },
    ]);
  };

  const handleClearRoute = () => {
    setWaypoints([]);
    setRouteModeLabel('idle');
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim() || !meetingPoint.trim()) {
      setFormError(t('composer.validationTitle'));
      return;
    }

    const combinedDate = new Date(`${dateStr}T${timeStr}:00`);
    if (Number.isNaN(combinedDate.getTime())) {
      setFormError(t('composer.validationDate'));
      return;
    }

    if (!startPoint) {
      setFormError(t('composer.validationLocation'));
      return;
    }

    const parsedDist = parseFloat(distanceInput);
    const distanceKm =
      Number.isFinite(parsedDist) && parsedDist > 0
        ? unit === 'mi'
          ? parsedDist * KM_PER_MILE
          : parsedDist
        : 5.0;

    const mins = Math.max(2, Math.min(15, parseInt(paceMin, 10) || 5));
    const secs = Math.max(0, Math.min(59, parseInt(paceSec, 10) || 0));
    const enteredPaceSec = mins * 60 + secs;
    const paceSecPerKm =
      unit === 'mi' ? Math.round(enteredPaceSec / KM_PER_MILE) : enteredPaceSec;

    try {
      await onSubmit({
        title: title.trim(),
        city: city.trim() || initialPreset.id,
        countryCode: countryCode || 'INT',
        startsAt: combinedDate.toISOString(),
        distanceKm: Math.round(distanceKm * 10) / 10,
        paceSecPerKm: Math.max(180, Math.min(780, paceSecPerKm)),
        paceGroup,
        surfaceType,
        meetingPoint: meetingPoint.trim(),
        description: description.trim(),
        startLat: startPoint.lat,
        startLng: startPoint.lng,
        waypoints,
        maxRunners: Math.max(2, Math.min(250, parseInt(maxRunners, 10) || 35)),
      });
    } catch (err: any) {
      setFormError(err?.message || t('toast.errorGeneric'));
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-[2px] sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('composer.title')}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl bg-white rounded-t-3xl sm:rounded-2xl max-h-[94vh] flex flex-col shadow-2xl border border-[#E5E7EB] overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#111315]">
              {t('composer.title')}
            </h2>
            <p className="text-xs sm:text-sm text-[#57606A] mt-0.5">
              {t('composer.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('composer.cancel')}
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-[#57606A] hover:text-[#111315] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleFormSubmit}
          className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#E5E7EB]"
        >
          {/* Left Column: Run Details */}
          <div className="lg:col-span-5 p-5 sm:p-6 space-y-4">
            <h3 className="text-xs font-semibold text-[#57606A]">
              {t('composer.stepDetails')}
            </h3>

            {formError && (
              <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3.5 py-2.5 text-xs text-[#991B1B]">
                {formError}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#111315] mb-1.5">
                {t('composer.runTitle')}
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('composer.runTitlePlaceholder')}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[#D1D5DB] text-sm text-[#111315] placeholder:text-[#8C959F] focus:outline-none focus:border-[#111315]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#111315] mb-1.5">
                  {t('composer.city')}
                </label>
                <select
                  value={
                    REPRESENTATIVE_CITIES.some((c) => c.id === city) ? city : 'custom'
                  }
                  onChange={(e) => {
                    if (e.target.value !== 'custom') {
                      handleCitySelect(e.target.value);
                    }
                  }}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-[#D1D5DB] bg-white text-sm text-[#111315] focus:outline-none focus:border-[#111315]"
                >
                  {REPRESENTATIVE_CITIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {localizeCity(c.id)}
                    </option>
                  ))}
                  {!REPRESENTATIVE_CITIES.some((c) => c.id === city) && (
                    <option value="custom">{city}</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#111315] mb-1.5">
                  {t('composer.maxRunners')}
                </label>
                <input
                  type="number"
                  min={2}
                  max={250}
                  value={maxRunners}
                  onChange={(e) => setMaxRunners(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[#D1D5DB] font-mono tabular-nums text-sm text-[#111315] focus:outline-none focus:border-[#111315]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#111315] mb-1.5">
                  {t('composer.date')}
                </label>
                <input
                  type="date"
                  required
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-[#D1D5DB] font-mono text-sm text-[#111315] focus:outline-none focus:border-[#111315]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#111315] mb-1.5">
                  {t('composer.time')}
                </label>
                <input
                  type="time"
                  required
                  value={timeStr}
                  onChange={(e) => setTimeStr(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-[#D1D5DB] font-mono text-sm text-[#111315] focus:outline-none focus:border-[#111315]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#111315] mb-1.5">
                  {t('composer.paceGroup')}
                </label>
                <select
                  value={paceGroup}
                  onChange={(e) => setPaceGroup(e.target.value as any)}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-[#D1D5DB] bg-white text-sm text-[#111315] focus:outline-none focus:border-[#111315]"
                >
                  <option value="social">{t('paceGroup.social')}</option>
                  <option value="tempo">{t('paceGroup.tempo')}</option>
                  <option value="threshold">{t('paceGroup.threshold')}</option>
                  <option value="long">{t('paceGroup.long')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#111315] mb-1.5">
                  {t('composer.surface')}
                </label>
                <select
                  value={surfaceType}
                  onChange={(e) => setSurfaceType(e.target.value as any)}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-[#D1D5DB] bg-white text-sm text-[#111315] focus:outline-none focus:border-[#111315]"
                >
                  <option value="park">{t('surface.park')}</option>
                  <option value="road">{t('surface.road')}</option>
                  <option value="waterfront">{t('surface.waterfront')}</option>
                  <option value="trail">{t('surface.trail')}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#111315] mb-1.5">
                  {t('composer.distance', { unit })}
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="100"
                  required
                  value={distanceInput}
                  onChange={(e) => setDistanceInput(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[#D1D5DB] font-mono tabular-nums text-sm text-[#111315] focus:outline-none focus:border-[#111315]"
                />
                <p className="text-[11px] text-[#57606A] mt-1">
                  {routeModeLabel === 'live'
                    ? t('run.routeCalculated')
                    : t('composer.distanceAutoHint')}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#111315] mb-1.5">
                  {t('composer.targetPace', { unit: `/${unit}` })}
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={2}
                    max={15}
                    value={paceMin}
                    onChange={(e) => setPaceMin(e.target.value)}
                    aria-label="Minutes"
                    className="w-full min-h-[44px] px-2.5 py-2.5 rounded-xl border border-[#D1D5DB] font-mono tabular-nums text-sm text-center text-[#111315] focus:outline-none focus:border-[#111315]"
                  />
                  <span className="font-mono text-sm font-semibold text-[#57606A]">:</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={paceSec}
                    onChange={(e) => setPaceSec(e.target.value.padStart(2, '0').slice(-2))}
                    aria-label="Seconds"
                    className="w-full min-h-[44px] px-2.5 py-2.5 rounded-xl border border-[#D1D5DB] font-mono tabular-nums text-sm text-center text-[#111315] focus:outline-none focus:border-[#111315]"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#111315] mb-1.5">
                {t('composer.description')}
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('composer.descriptionPlaceholder')}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#D1D5DB] text-sm text-[#111315] placeholder:text-[#8C959F] focus:outline-none focus:border-[#111315] resize-none"
              />
            </div>
          </div>

          {/* Right Column: Interactive Route Builder */}
          <div className="lg:col-span-7 p-5 sm:p-6 flex flex-col gap-4 bg-[#FAFAFA]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-[#57606A]">
                {t('composer.stepRoute')}
              </h3>
              <span className="font-mono tabular-nums text-xs text-[#57606A]">
                {t('run.pointsCount', { count: (startPoint ? 1 : 0) + waypoints.length })}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#111315] mb-1.5">
                {t('composer.meetingPoint')}
              </label>
              {hasMapsApiKey ? (
                <PlaceSearchInput
                  value={meetingPoint}
                  onChange={setMeetingPoint}
                  onSelectPlace={handlePlaceSelect}
                  placeholder={t('composer.meetingPointPlaceholder')}
                  language={locale}
                />
              ) : (
                <input
                  type="text"
                  required
                  value={meetingPoint}
                  onChange={(e) => setMeetingPoint(e.target.value)}
                  placeholder={t('composer.meetingPointPlaceholder')}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[#D1D5DB] bg-white text-sm text-[#111315] focus:outline-none focus:border-[#111315]"
                />
              )}
            </div>

            <p className="text-xs text-[#57606A] flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#E84A27] shrink-0" />
              <span>{t('composer.mapHint')}</span>
            </p>

            {/* Map container with explicit height */}
            <div className="h-[300px] sm:h-[360px] lg:flex-1 lg:min-h-[340px]">
              {hasMapsApiKey ? (
                <RouteBuilderMap
                  center={mapCenter}
                  startPoint={startPoint}
                  waypoints={waypoints}
                  onMapClick={handleMapClick}
                  onDistanceComputed={handleDistanceComputed}
                />
              ) : (
                <div className="w-full h-full rounded-xl border border-[#E5E7EB] bg-white flex flex-col items-center justify-center p-6 text-center">
                  <p className="text-sm font-semibold text-[#111315]">{t('map.missingKeyTitle')}</p>
                  <p className="text-xs text-[#57606A] mt-1">{t('map.missingKeyBody')}</p>
                </div>
              )}
            </div>

            {/* Route map controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={waypoints.length === 0}
                  onClick={handleUndoPoint}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white border border-[#D1D5DB] text-xs font-medium text-[#111315] hover:bg-[#F3F4F6] disabled:opacity-40 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t('composer.undoPoint')}
                </button>
                <button
                  type="button"
                  disabled={!startPoint || waypoints.length === 0}
                  onClick={handleCloseLoop}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white border border-[#D1D5DB] text-xs font-medium text-[#111315] hover:bg-[#F3F4F6] disabled:opacity-40 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <CornerDownLeft className="w-3.5 h-3.5" />
                  {t('composer.closeLoop')}
                </button>
                <button
                  type="button"
                  disabled={waypoints.length === 0}
                  onClick={handleClearRoute}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white border border-[#D1D5DB] text-xs font-medium text-[#57606A] hover:text-[#B91C1C] hover:border-[#FECACA] disabled:opacity-40 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('composer.clearRoute')}
                </button>
              </div>

              <div className="flex items-center gap-2 ml-auto w-full sm:w-auto justify-end pt-2 sm:pt-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-[#57606A] hover:bg-[#E5E7EB]/60 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {t('composer.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#E84A27] text-white text-sm font-semibold hover:bg-[#D13F1E] transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSubmitting ? t('composer.publishing') : t('composer.publish')}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
