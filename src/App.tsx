import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import {
  Calendar,
  Compass,
  Globe,
  List,
  LogIn,
  LogOut,
  Map as MapIcon,
  Plus,
  RefreshCw,
  Search,
  User as UserIcon,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { I18nProvider, useI18n } from './contexts/I18nContext';
import { SUPPORTED_LOCALES } from './i18n/translations';
import { REPRESENTATIVE_CITIES } from './lib/cities';
import { RunItem } from './types/run';
import { RunCard } from './components/RunCard';
import { RouteMapView } from './components/RouteMapView';
import { RunDetailSheet } from './components/RunDetailSheet';
import { PostRunFormValues, PostRunModal } from './components/PostRunModal';
import { CitiesView } from './components/CitiesView';

type ActiveTab = 'schedule' | 'map' | 'cities' | 'myRuns';
type MobileDisplayMode = 'list' | 'map';

interface ToastState {
  message: string;
  tone: 'neutral' | 'success' | 'error';
}

const RunClubShell: React.FC = () => {
  const { user, signInWithGoogle, signOut, getIdToken, authError, clearAuthError } = useAuth();
  const { locale, unit, setLocale, setUnit, t, localizeCity } = useI18n();

  const [mapsApiKey, setMapsApiKey] = useState<string>(
    () => import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  );
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('schedule');
  const [mobileMode, setMobileMode] = useState<MobileDisplayMode>('list');

  // Filters
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [paceFilter, setPaceFilter] = useState<string>('all');
  const [distanceFilter, setDistanceFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Data state
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [detailRunId, setDetailRunId] = useState<number | null>(null);

  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [rsvpPendingId, setRsvpPendingId] = useState<number | null>(null);
  const [deletePendingId, setDeletePendingId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, tone: ToastState['tone'] = 'neutral') => {
    setToast({ message, tone });
    window.setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3600);
  }, []);

  // Listen for Google Maps Platform Demo Key quota exceeded events
  useEffect(() => {
    const handler = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  // Load Maps API key from server config if not injected at build time
  useEffect(() => {
    if (mapsApiKey) return;
    fetch('/api/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.mapsApiKey) {
          setMapsApiKey(data.mapsApiKey);
        }
      })
      .catch(() => {
        // Ignore config error
      });
  }, [mapsApiKey]);

  // Fetch all upcoming runs from Cloud SQL via Express API
  const fetchRuns = useCallback(async () => {
    setLoadingRuns(true);
    setLoadError(null);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/runs', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || t('error.loadRuns'));
      }
      const data = await res.json();
      const list: RunItem[] = Array.isArray(data.runs) ? data.runs : [];
      setRuns(list);
      setSelectedRunId((prev) => {
        if (prev && list.some((r) => r.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (err: any) {
      setLoadError(err?.message || t('error.loadRuns'));
    } finally {
      setLoadingRuns(false);
    }
  }, [getIdToken, t]);

  useEffect(() => {
    void fetchRuns();
  }, [fetchRuns, user?.uid]);

  // Compute unique city list (9 flagship cities + any newly posted custom cities)
  const availableCities = useMemo(() => {
    const known = REPRESENTATIVE_CITIES.map((c) => c.id);
    const extras = Array.from(
      new Set(runs.map((r) => r.city).filter((c) => !known.includes(c))),
    ).sort();
    return [...known, ...extras];
  }, [runs]);

  // Filter runs reactively
  const filteredRuns = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return runs.filter((run) => {
      if (activeTab === 'myRuns') {
        if (!user) return false;
        if (!run.isHost && !run.isJoined) return false;
      }
      if (cityFilter !== 'all' && run.city !== cityFilter) return false;
      if (paceFilter !== 'all' && run.paceGroup !== paceFilter) return false;
      if (distanceFilter === '5k' && run.distanceKm > 7) return false;
      if (distanceFilter === '10k' && (run.distanceKm <= 7 || run.distanceKm > 12)) return false;
      if (distanceFilter === 'long' && run.distanceKm <= 12) return false;
      if (query) {
        const localizedCityName = localizeCity(run.city).toLowerCase();
        const matches =
          run.title.toLowerCase().includes(query) ||
          run.city.toLowerCase().includes(query) ||
          localizedCityName.includes(query) ||
          run.meetingPoint.toLowerCase().includes(query) ||
          run.description.toLowerCase().includes(query);
        if (!matches) return false;
      }
      return true;
    });
  }, [runs, activeTab, user, cityFilter, paceFilter, distanceFilter, searchQuery, localizeCity]);

  // Keep selectedRun synced with visible filtered runs
  const selectedRun = useMemo(() => {
    if (filteredRuns.length === 0) return null;
    return filteredRuns.find((r) => r.id === selectedRunId) ?? filteredRuns[0];
  }, [filteredRuns, selectedRunId]);

  const detailRun = useMemo(() => {
    if (!detailRunId) return null;
    return runs.find((r) => r.id === detailRunId) ?? null;
  }, [runs, detailRunId]);

  const hasActiveFilters =
    cityFilter !== 'all' ||
    paceFilter !== 'all' ||
    distanceFilter !== 'all' ||
    searchQuery.trim() !== '';

  const resetFilters = () => {
    setCityFilter('all');
    setPaceFilter('all');
    setDistanceFilter('all');
    setSearchQuery('');
  };

  const handleOpenPostModal = async () => {
    if (!user) {
      const signedIn = await signInWithGoogle();
      if (!signedIn) {
        showToast(t('run.signInToJoin'), 'neutral');
        return;
      }
    }
    setIsPostModalOpen(true);
  };

  const handleToggleRsvp = async (run: RunItem) => {
    let activeUser = user;
    if (!activeUser) {
      activeUser = await signInWithGoogle();
      if (!activeUser) {
        showToast(t('run.signInToJoin'), 'neutral');
        return;
      }
    }

    setRsvpPendingId(run.id);
    try {
      const token = await activeUser.getIdToken();
      const method = run.isJoined ? 'DELETE' : 'POST';
      const res = await fetch(`/api/runs/${run.id}/rsvp`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error || t('toast.errorGeneric'));
      }

      const data = await res.json();
      if (data?.run) {
        setRuns((prev) => prev.map((r) => (r.id === run.id ? data.run : r)));
        showToast(
          run.isJoined ? t('toast.rsvpLeft') : t('toast.rsvpJoined'),
          'success',
        );
      }
    } catch (err: any) {
      showToast(err?.message || t('toast.errorGeneric'), 'error');
    } finally {
      setRsvpPendingId(null);
    }
  };

  const handlePublishRun = async (values: PostRunFormValues) => {
    const token = await getIdToken();
    if (!token) {
      throw new Error(t('run.signInToJoin'));
    }
    setIsPublishing(true);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error || t('toast.errorGeneric'));
      }
      const data = await res.json();
      if (data?.run) {
        setRuns((prev) =>
          [...prev, data.run].sort(
            (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
          ),
        );
        setCityFilter('all');
        setPaceFilter('all');
        setDistanceFilter('all');
        setSearchQuery('');
        setActiveTab('schedule');
        setSelectedRunId(data.run.id);
        setIsPostModalOpen(false);
        showToast(t('toast.runPublished'), 'success');
      }
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDeleteRun = async (run: RunItem) => {
    const token = await getIdToken();
    if (!token) return;
    setDeletePendingId(run.id);
    try {
      const res = await fetch(`/api/runs/${run.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error || t('toast.errorGeneric'));
      }
      setRuns((prev) => prev.filter((r) => r.id !== run.id));
      setDetailRunId(null);
      showToast(t('toast.runCanceled'), 'neutral');
    } catch (err: any) {
      showToast(err?.message || t('toast.errorGeneric'), 'error');
    } finally {
      setDeletePendingId(null);
    }
  };

  const handleSelectCityChapter = (cityId: string) => {
    setCityFilter(cityId);
    setPaceFilter('all');
    setDistanceFilter('all');
    setSearchQuery('');
    setActiveTab('schedule');
    const firstInCity = runs.find((r) => r.city === cityId);
    if (firstInCity) {
      setSelectedRunId(firstInCity.id);
    }
  };

  const mapsContent = (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] text-[#111315] pb-16 lg:pb-0">
      {/* Required Google Maps Platform Demo Key Quota Banner */}
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Top Navigation Bar — Strict 3-Zone Contract on Desktop, Compact 52px on Mobile */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[52px] lg:h-16 flex items-center justify-between gap-4 lg:gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('schedule')}
            className="font-display text-lg lg:text-xl font-bold tracking-tight text-[#111315] whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t('brand.name')}
          </button>

          {/* Zone 2: Clean Single-Line Nav Links (Desktop) */}
          <nav
            aria-label="Primary navigation"
            className="hidden lg:flex items-center gap-7 text-sm font-medium"
          >
            {(
              [
                ['schedule', t('nav.upcoming')],
                ['map', t('nav.map')],
                ['cities', t('nav.cities')],
                ['myRuns', t('nav.myRuns')],
              ] as [ActiveTab, string][]
            ).map(([tabKey, label]) => {
              const isActive = activeTab === tabKey;
              return (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => setActiveTab(tabKey)}
                  className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                    isActive
                      ? 'text-[#111315] border-[#E84A27]'
                      : 'text-[#57606A] border-transparent hover:text-[#111315]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action (Desktop) / Compact Locale & Auth (Mobile) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Mobile compact language switcher */}
            <label className="lg:hidden relative inline-flex items-center">
              <span className="sr-only">Language</span>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as any)}
                className="min-h-[36px] px-2 py-1 rounded-lg bg-[#F3F4F6] text-xs font-mono font-semibold text-[#111315] border border-transparent focus:border-[#111315] focus:outline-none"
              >
                {SUPPORTED_LOCALES.map((loc) => (
                  <option key={loc.code} value={loc.code}>
                    {loc.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Mobile Sign In / Avatar trigger */}
            <div className="lg:hidden">
              {user ? (
                <button
                  type="button"
                  onClick={signOut}
                  aria-label={t('nav.signOut')}
                  className="min-h-[36px] min-w-[36px] rounded-full overflow-hidden border border-[#D1D5DB] flex items-center justify-center bg-[#F3F4F6]"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'Account'}
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 object-cover"
                    />
                  ) : (
                    <UserIcon className="w-4 h-4 text-[#111315]" />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#111315] text-white text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  {t('nav.signIn')}
                </button>
              )}
            </div>

            {/* Desktop Single Primary CTA */}
            <button
              type="button"
              onClick={() => void handleOpenPostModal()}
              className="hidden lg:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E84A27] text-white text-xs font-semibold hover:bg-[#D13F1E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {t('nav.postRun')}
            </button>
          </div>
        </div>
      </header>

      {/* Auth Error Banner */}
      {authError && (
        <div className="bg-[#FEF2F2] border-b border-[#FECACA] px-4 py-2.5 text-xs text-[#991B1B] flex items-center justify-center gap-3">
          <span>{authError}</span>
          <button
            type="button"
            onClick={clearAuthError}
            className="underline font-semibold cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Workspace Utility & Filter Bar (Language, Units, Account, and Schedule Filters) */}
      <div className="bg-white border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Left: Context heading or city/pace filters */}
          {activeTab === 'cities' ? (
            <div className="flex items-center gap-2 text-xs text-[#57606A]">
              <Globe className="w-4 h-4 text-[#E84A27]" />
              <span>
                {REPRESENTATIVE_CITIES.length} {t('nav.cities').toLowerCase()}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {runs.length === 1
                  ? t('filters.singleResult')
                  : t('filters.resultsCount', { count: runs.length })}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              {/* City filter select */}
              <select
                aria-label={t('filters.city')}
                value={cityFilter}
                onChange={(e) => {
                  const next = e.target.value;
                  setCityFilter(next);
                  const match = runs.find((r) => next === 'all' || r.city === next);
                  if (match) setSelectedRunId(match.id);
                }}
                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#D1D5DB] bg-white text-xs sm:text-sm font-medium text-[#111315] focus:outline-none focus:border-[#111315] cursor-pointer"
              >
                <option value="all">{t('filters.allCities')}</option>
                {availableCities.map((c) => (
                  <option key={c} value={c}>
                    {localizeCity(c)}
                  </option>
                ))}
              </select>

              {/* Pace filter select */}
              <select
                aria-label={t('filters.pace')}
                value={paceFilter}
                onChange={(e) => setPaceFilter(e.target.value)}
                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#D1D5DB] bg-white text-xs sm:text-sm font-medium text-[#111315] focus:outline-none focus:border-[#111315] cursor-pointer"
              >
                <option value="all">{t('filters.allPaces')}</option>
                <option value="social">{t('paceGroup.social')}</option>
                <option value="tempo">{t('paceGroup.tempo')}</option>
                <option value="threshold">{t('paceGroup.threshold')}</option>
                <option value="long">{t('paceGroup.long')}</option>
              </select>

              {/* Distance filter select */}
              <select
                aria-label={t('filters.distance')}
                value={distanceFilter}
                onChange={(e) => setDistanceFilter(e.target.value)}
                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#D1D5DB] bg-white text-xs sm:text-sm font-medium text-[#111315] focus:outline-none focus:border-[#111315] cursor-pointer"
              >
                <option value="all">{t('filters.allDistances')}</option>
                <option value="5k">
                  {unit === 'mi' ? t('filters.dist5kMi') : t('filters.dist5k')}
                </option>
                <option value="10k">
                  {unit === 'mi' ? t('filters.dist10kMi') : t('filters.dist10k')}
                </option>
                <option value="long">
                  {unit === 'mi' ? t('filters.distLongMi') : t('filters.distLong')}
                </option>
              </select>

              {/* Search box */}
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="w-3.5 h-3.5 text-[#8C959F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('filters.searchPlaceholder')}
                  className="w-full min-h-[40px] pl-8 pr-3 py-1.5 rounded-xl border border-[#D1D5DB] bg-[#FAFAFA] focus:bg-white text-xs sm:text-sm text-[#111315] placeholder:text-[#8C959F] focus:outline-none focus:border-[#111315]"
                />
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="min-h-[40px] px-2.5 text-xs font-medium text-[#E84A27] hover:underline whitespace-nowrap cursor-pointer"
                >
                  {t('filters.clear')}
                </button>
              )}
            </div>
          )}

          {/* Right: Segmented Unit Toggle (km/mi), Desktop Language Switcher (EN/PT/ES/FR), and Desktop Account */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Unit segmented toggle */}
            <div
              role="group"
              aria-label="Distance unit"
              className="inline-flex items-center p-0.5 rounded-lg bg-[#F3F4F6] border border-[#E5E7EB]"
            >
              {(['km', 'mi'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`min-h-[32px] px-2.5 text-xs font-mono font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    unit === u
                      ? 'bg-white text-[#111315] shadow-xs'
                      : 'text-[#57606A] hover:text-[#111315]'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>

            {/* Desktop 4-language segmented switcher */}
            <div
              role="group"
              aria-label="Language"
              className="hidden lg:inline-flex items-center p-0.5 rounded-lg bg-[#F3F4F6] border border-[#E5E7EB]"
            >
              {SUPPORTED_LOCALES.map((loc) => (
                <button
                  key={loc.code}
                  type="button"
                  onClick={() => setLocale(loc.code)}
                  title={loc.nativeName}
                  className={`min-h-[32px] px-2 text-xs font-mono font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    locale === loc.code
                      ? 'bg-white text-[#111315] shadow-xs'
                      : 'text-[#57606A] hover:text-[#111315]'
                  }`}
                >
                  {loc.label}
                </button>
              ))}
            </div>

            {/* Desktop Sign In / Member account */}
            <div className="hidden lg:flex items-center pl-2 border-l border-[#E5E7EB]">
              {user ? (
                <div className="flex items-center gap-2">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'Member'}
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 rounded-full object-cover border border-[#D1D5DB]"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[#111315] text-white text-xs font-semibold flex items-center justify-center">
                      {(user.displayName || user.email || 'M')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-medium text-[#111315] max-w-[110px] truncate">
                    {user.displayName || user.email?.split('@')[0]}
                  </span>
                  <button
                    type="button"
                    onClick={signOut}
                    title={t('nav.signOut')}
                    className="p-1.5 rounded-lg text-[#57606A] hover:text-[#111315] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  className="min-h-[34px] px-3 py-1.5 rounded-lg border border-[#D1D5DB] bg-white hover:border-[#111315] text-xs font-semibold text-[#111315] inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  {t('nav.signIn')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        {activeTab === 'cities' ? (
          <CitiesView runs={runs} onSelectCity={handleSelectCityChapter} />
        ) : activeTab === 'map' ? (
          /* Full-Width Interactive Route Explorer View */
          <div className="flex-1 relative min-h-[calc(100vh-190px)] h-[calc(100vh-190px)]">
            {mapsApiKey ? (
              <RouteMapView
                runs={filteredRuns}
                selectedRun={selectedRun}
                selectedCityFilter={cityFilter}
                onSelectRun={(r) => setSelectedRunId(r.id)}
                onOpenDetail={(r) => setDetailRunId(r.id)}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center">
                <p className="font-display text-lg font-semibold text-[#111315]">
                  {t('map.missingKeyTitle')}
                </p>
                <p className="text-sm text-[#57606A] mt-1">{t('map.missingKeyBody')}</p>
              </div>
            )}
          </div>
        ) : (
          /* Schedule & My Runs Split Workspace (Desktop 2-Column, Mobile List/Map Switch) */
          <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 flex-1 flex flex-col">
            {/* Editorial Title + Mobile List/Map Toggle */}
            <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#111315] tracking-tight">
                  {activeTab === 'myRuns' ? t('nav.myRuns') : t('hero.title')}
                </h1>
                <p className="text-xs sm:text-sm text-[#57606A] mt-1">
                  {filteredRuns.length === 1
                    ? t('filters.singleResult')
                    : t('filters.resultsCount', { count: filteredRuns.length })}
                  {cityFilter !== 'all' ? ` · ${localizeCity(cityFilter)}` : ''}
                </p>
              </div>

              {/* Mobile List / Map Segmented Switcher */}
              <div className="lg:hidden inline-flex items-center p-0.5 rounded-xl bg-[#F3F4F6] border border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setMobileMode('list')}
                  className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                    mobileMode === 'list'
                      ? 'bg-white text-[#111315] shadow-xs'
                      : 'text-[#57606A]'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  {t('run.openListView')}
                </button>
                <button
                  type="button"
                  onClick={() => setMobileMode('map')}
                  className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                    mobileMode === 'map'
                      ? 'bg-white text-[#111315] shadow-xs'
                      : 'text-[#57606A]'
                  }`}
                >
                  <MapIcon className="w-3.5 h-3.5" />
                  {t('run.openMapView')}
                </button>
              </div>
            </div>

            {/* Load Error State */}
            {loadError && (
              <div className="mb-5 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[#991B1B]">{loadError}</p>
                <button
                  type="button"
                  onClick={() => void fetchRuns()}
                  className="min-h-[40px] px-4 py-1.5 rounded-xl bg-white border border-[#FECACA] text-xs font-semibold text-[#991B1B] inline-flex items-center gap-1.5 cursor-pointer hover:bg-[#FEE2E2]"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {t('error.retry')}
                </button>
              </div>
            )}

            {/* Split Grid: Run Schedule List (Left 5 cols) + Sticky Interactive Map (Right 7 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1">
              {/* Left Column: Run List */}
              <div
                className={`lg:col-span-5 space-y-3.5 ${
                  mobileMode === 'map' ? 'hidden lg:block' : 'block'
                }`}
              >
                {loadingRuns ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-3 animate-pulse"
                    >
                      <div className="h-3 w-40 bg-[#F3F4F6] rounded" />
                      <div className="h-5 w-3/4 bg-[#F3F4F6] rounded" />
                      <div className="h-3.5 w-1/2 bg-[#F3F4F6] rounded" />
                      <div className="pt-3 border-t border-[#F3F4F6] grid grid-cols-3 gap-2">
                        <div className="h-8 bg-[#F3F4F6] rounded" />
                        <div className="h-8 bg-[#F3F4F6] rounded" />
                        <div className="h-8 bg-[#F3F4F6] rounded" />
                      </div>
                    </div>
                  ))
                ) : activeTab === 'myRuns' && !user ? (
                  <div className="rounded-2xl border border-[#E5E7EB] bg-white p-8 text-center">
                    <h2 className="font-display text-lg font-semibold text-[#111315]">
                      {t('empty.myRunsTitle')}
                    </h2>
                    <p className="text-sm text-[#57606A] mt-1.5">
                      {t('empty.myRunsSubtitle')}
                    </p>
                    <button
                      type="button"
                      onClick={() => void signInWithGoogle()}
                      className="mt-5 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#111315] text-white text-sm font-semibold hover:bg-[#E84A27] transition-colors inline-flex items-center gap-2 cursor-pointer"
                    >
                      <LogIn className="w-4 h-4" />
                      {t('empty.signInCta')}
                    </button>
                  </div>
                ) : filteredRuns.length === 0 ? (
                  <div className="rounded-2xl border border-[#E5E7EB] bg-white p-8 text-center">
                    <h2 className="font-display text-lg font-semibold text-[#111315]">
                      {activeTab === 'myRuns' ? t('empty.myRunsTitle') : t('empty.title')}
                    </h2>
                    <p className="text-sm text-[#57606A] mt-1.5">
                      {activeTab === 'myRuns' ? t('empty.myRunsSubtitle') : t('empty.subtitle')}
                    </p>
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={resetFilters}
                          className="min-h-[44px] px-4 py-2 rounded-xl border border-[#D1D5DB] text-xs font-semibold text-[#111315] hover:bg-[#F3F4F6] cursor-pointer"
                        >
                          {t('filters.clear')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleOpenPostModal()}
                        className="min-h-[44px] px-5 py-2 rounded-xl bg-[#E84A27] text-white text-xs font-semibold hover:bg-[#D13F1E] cursor-pointer"
                      >
                        {t('empty.cta')}
                      </button>
                    </div>
                  </div>
                ) : (
                  filteredRuns.map((run) => (
                    <RunCard
                      key={run.id}
                      run={run}
                      isSelected={selectedRun?.id === run.id}
                      isRsvpPending={rsvpPendingId === run.id}
                      onSelect={(r) => setSelectedRunId(r.id)}
                      onOpenDetail={(r) => {
                        setSelectedRunId(r.id);
                        setDetailRunId(r.id);
                      }}
                      onToggleRsvp={(r) => void handleToggleRsvp(r)}
                    />
                  ))
                )}
              </div>

              {/* Right Column: Sticky Interactive Google Map */}
              <div
                className={`lg:col-span-7 lg:sticky lg:top-[84px] h-[calc(100vh-220px)] min-h-[420px] lg:h-[calc(100vh-120px)] rounded-2xl overflow-hidden border border-[#E5E7EB] bg-white ${
                  mobileMode === 'list' ? 'hidden lg:block' : 'block'
                }`}
              >
                {mapsApiKey ? (
                  <RouteMapView
                    runs={filteredRuns}
                    selectedRun={selectedRun}
                    selectedCityFilter={cityFilter}
                    onSelectRun={(r) => setSelectedRunId(r.id)}
                    onOpenDetail={(r) => setDetailRunId(r.id)}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center">
                    <p className="font-display text-lg font-semibold text-[#111315]">
                      {t('map.missingKeyTitle')}
                    </p>
                    <p className="text-sm text-[#57606A] mt-1">{t('map.missingKeyBody')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (4 Destinations, Compact 60px, <15% Sticky Cap) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E5E7EB] pb-safe"
      >
        <div className="grid grid-cols-4 h-[58px] items-center">
          <button
            type="button"
            onClick={() => {
              setActiveTab('schedule');
              setMobileMode('list');
            }}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 ${
              activeTab === 'schedule' ? 'text-[#E84A27]' : 'text-[#57606A]'
            }`}
          >
            <Calendar className="w-5 h-5" />
            <span className="text-[10px] font-medium truncate max-w-[76px]">
              {t('nav.upcoming')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cities')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 ${
              activeTab === 'cities' ? 'text-[#E84A27]' : 'text-[#57606A]'
            }`}
          >
            <Compass className="w-5 h-5" />
            <span className="text-[10px] font-medium truncate max-w-[76px]">
              {t('nav.cities')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleOpenPostModal()}
            className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[#111315]"
          >
            <div className="w-7 h-7 rounded-full bg-[#E84A27] text-white flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-semibold text-[#111315] truncate max-w-[76px]">
              {t('nav.postRun')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('myRuns')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 ${
              activeTab === 'myRuns' ? 'text-[#E84A27]' : 'text-[#57606A]'
            }`}
          >
            <UserIcon className="w-5 h-5" />
            <span className="text-[10px] font-medium truncate max-w-[76px]">
              {t('nav.myRuns')}
            </span>
          </button>
        </div>
      </nav>

      {/* Run Detail Slide-Over / Mobile Bottom Sheet */}
      <RunDetailSheet
        run={detailRun}
        isRsvpPending={detailRun ? rsvpPendingId === detailRun.id : false}
        isDeletePending={detailRun ? deletePendingId === detailRun.id : false}
        onClose={() => setDetailRunId(null)}
        onToggleRsvp={(r) => void handleToggleRsvp(r)}
        onDeleteRun={(r) => void handleDeleteRun(r)}
      />

      {/* Post a Run Composer Modal */}
      <PostRunModal
        isOpen={isPostModalOpen}
        hasMapsApiKey={Boolean(mapsApiKey)}
        defaultCity={cityFilter !== 'all' ? cityFilter : undefined}
        isSubmitting={isPublishing}
        onClose={() => setIsPostModalOpen(false)}
        onSubmit={handlePublishRun}
      />

      {/* Completion Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg border text-xs sm:text-sm font-medium whitespace-nowrap ${
            toast.tone === 'error'
              ? 'bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]'
              : toast.tone === 'success'
                ? 'bg-[#111315] text-white border-[#111315]'
                : 'bg-white text-[#111315] border-[#D1D5DB]'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );

  if (!mapsApiKey) {
    return mapsContent;
  }

  return (
    <APIProvider key={locale} apiKey={mapsApiKey} language={locale}>
      {mapsContent}
    </APIProvider>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <I18nProvider>
        <RunClubShell />
      </I18nProvider>
    </AuthProvider>
  );
}
