import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  Map as GoogleMap,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { LocateFixed, Navigation } from 'lucide-react';
import { RunItem } from '../types/run';
import { useI18n } from '../contexts/I18nContext';
import { DEFAULT_WORLD_CENTER, REPRESENTATIVE_CITIES } from '../lib/cities';

interface RouteMapViewProps {
  runs: RunItem[];
  selectedRun: RunItem | null;
  selectedCityFilter: string;
  onSelectRun: (run: RunItem) => void;
  onOpenDetail: (run: RunItem) => void;
}

interface CachedRoutePath {
  path: Array<{ lat: number; lng: number }>;
  distanceMeters: number;
  mode: 'live' | 'fallback';
}

const routePathCache: Record<string, CachedRoutePath> = {};

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function isQuotaError(err: unknown): boolean {
  const text = String((err as any)?.message ?? err ?? '');
  const status = (err as any)?.status ?? (err as any)?.code;
  return (
    status === 429 ||
    status === 'OVER_QUERY_LIMIT' ||
    status === 'RESOURCE_EXHAUSTED' ||
    text.includes('OVER_QUERY_LIMIT') ||
    text.includes('RESOURCE_EXHAUSTED') ||
    text.includes('QuotaExceededError') ||
    text.includes('429')
  );
}

const SelectedRouteLayer: React.FC<{
  run: RunItem | null;
  selectedCityFilter: string;
  allRuns: RunItem[];
  onRouteStatus: (status: 'idle' | 'loading' | 'live' | 'fallback') => void;
}> = ({ run, selectedCityFilter, allRuns, onRouteStatus }) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const mapsLib = useMapsLibrary('maps');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!map) return;

    // Fit map to city or all runs when no specific run is selected
    if (!run) {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
      onRouteStatus('idle');

      if (selectedCityFilter !== 'all') {
        const preset = REPRESENTATIVE_CITIES.find((c) => c.id === selectedCityFilter);
        if (preset) {
          map.panTo(preset.center);
          map.setZoom(preset.zoom);
          return;
        }
      }
      if (allRuns.length > 0 && window.google?.maps?.LatLngBounds) {
        const bounds = new window.google.maps.LatLngBounds();
        allRuns.forEach((r) => bounds.extend({ lat: r.startLat, lng: r.startLng }));
        map.fitBounds(bounds, 64);
      }
      return;
    }

    let cancelled = false;

    const clearPolylines = () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };

    const drawPath = (
      path: Array<{ lat: number; lng: number }>,
      dashed: boolean,
    ) => {
      if (!mapsLib || !map) return;
      clearPolylines();
      const poly = new mapsLib.Polyline({
        path,
        strokeColor: '#E84A27',
        strokeOpacity: dashed ? 0 : 0.92,
        strokeWeight: dashed ? 4 : 5,
        icons: dashed
          ? [
              {
                icon: {
                  path: 'M 0,-1 0,1',
                  strokeOpacity: 0.9,
                  strokeColor: '#E84A27',
                  scale: 3,
                },
                offset: '0',
                repeat: '12px',
              },
            ]
          : undefined,
        map,
      });
      polylinesRef.current = [poly];

      if (window.google?.maps?.LatLngBounds && path.length > 1) {
        const bounds = new window.google.maps.LatLngBounds();
        path.forEach((pt) => bounds.extend(pt));
        map.fitBounds(bounds, { top: 64, right: 48, bottom: 72, left: 48 });
      } else {
        map.panTo({ lat: run.startLat, lng: run.startLng });
        map.setZoom(14);
      }
    };

    const rawPoints: Array<{ lat: number; lng: number }> = [
      { lat: run.startLat, lng: run.startLng },
      ...(run.waypoints || []).map((w) => ({ lat: w.lat, lng: w.lng })),
    ];

    if (rawPoints.length < 2) {
      clearPolylines();
      onRouteStatus('idle');
      map.panTo({ lat: run.startLat, lng: run.startLng });
      map.setZoom(15);
      return;
    }

    const cacheKey = `${run.id}:${rawPoints.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|')}`;
    const cached = routePathCache[cacheKey];
    if (cached) {
      drawPath(cached.path, cached.mode === 'fallback');
      onRouteStatus(cached.mode);
      return;
    }

    if (!routesLib || !(routesLib as any).Route?.computeRoutes) {
      drawPath(rawPoints, true);
      onRouteStatus('fallback');
      return;
    }

    onRouteStatus('loading');
    const origin = rawPoints[0];
    const destination = rawPoints[rawPoints.length - 1];
    const intermediates = rawPoints.slice(1, -1).map((pt) => ({ location: pt }));

    // Modern Routes API JS SDK wrapper (replaces legacy DirectionsService)
    // Docs: https://developers.google.com/maps/documentation/javascript/routes?utm_campaign=gmp_mcp_codeassist_v1_aistudio
    (routesLib as any).Route.computeRoutes({
      origin,
      destination,
      ...(intermediates.length > 0 ? { intermediates } : {}),
      travelMode: 'WALKING',
      fields: ['path', 'distanceMeters', 'viewport'],
    })
      .then((response: any) => {
        if (cancelled) return;
        const primaryRoute = response?.routes?.[0];
        if (!primaryRoute) {
          routePathCache[cacheKey] = {
            path: rawPoints,
            distanceMeters: run.distanceKm * 1000,
            mode: 'fallback',
          };
          drawPath(rawPoints, true);
          onRouteStatus('fallback');
          return;
        }

        clearPolylines();
        if (typeof primaryRoute.createPolylines === 'function') {
          const rendered: google.maps.Polyline[] = primaryRoute.createPolylines();
          const extractedPath: Array<{ lat: number; lng: number }> = [];
          rendered.forEach((poly) => {
            poly.setOptions({
              strokeColor: '#E84A27',
              strokeWeight: 5,
              strokeOpacity: 0.92,
            });
            poly.setMap(map);
            const pathArray = poly.getPath?.();
            if (pathArray) {
              for (let i = 0; i < pathArray.getLength(); i += 1) {
                const pt = pathArray.getAt(i);
                extractedPath.push({ lat: pt.lat(), lng: pt.lng() });
              }
            }
          });
          polylinesRef.current = rendered;
          if (extractedPath.length > 1) {
            routePathCache[cacheKey] = {
              path: extractedPath,
              distanceMeters: primaryRoute.distanceMeters ?? run.distanceKm * 1000,
              mode: 'live',
            };
          }
        } else if (Array.isArray(primaryRoute.path) && primaryRoute.path.length > 1) {
          const pts = primaryRoute.path.map((p: any) => ({
            lat: typeof p.lat === 'function' ? p.lat() : p.lat,
            lng: typeof p.lng === 'function' ? p.lng() : p.lng,
          }));
          routePathCache[cacheKey] = {
            path: pts,
            distanceMeters: primaryRoute.distanceMeters ?? run.distanceKm * 1000,
            mode: 'live',
          };
          drawPath(pts, false);
        } else {
          drawPath(rawPoints, true);
        }

        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport, { top: 64, right: 48, bottom: 72, left: 48 });
        }
        onRouteStatus('live');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.warn('Routes API fallback triggered:', err);
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        let approxKm = 0;
        for (let i = 1; i < rawPoints.length; i += 1) {
          approxKm += haversineKm(rawPoints[i - 1], rawPoints[i]);
        }
        routePathCache[cacheKey] = {
          path: rawPoints,
          distanceMeters: Math.round(approxKm * 1000),
          mode: 'fallback',
        };
        drawPath(rawPoints, true);
        onRouteStatus('fallback');
      });

    return () => {
      cancelled = true;
      clearPolylines();
    };
  }, [map, routesLib, mapsLib, run, selectedCityFilter, allRuns, onRouteStatus]);

  return null;
};

const RecenterControl: React.FC<{ run: RunItem | null; runs: RunItem[] }> = ({ run, runs }) => {
  const map = useMap();
  const handleRecenter = () => {
    if (!map) return;
    if (run) {
      const pts = [
        { lat: run.startLat, lng: run.startLng },
        ...(run.waypoints || []),
      ];
      if (pts.length > 1 && window.google?.maps?.LatLngBounds) {
        const bounds = new window.google.maps.LatLngBounds();
        pts.forEach((p) => bounds.extend(p));
        map.fitBounds(bounds, 56);
      } else {
        map.panTo({ lat: run.startLat, lng: run.startLng });
        map.setZoom(14);
      }
    } else if (runs.length > 0 && window.google?.maps?.LatLngBounds) {
      const bounds = new window.google.maps.LatLngBounds();
      runs.forEach((r) => bounds.extend({ lat: r.startLat, lng: r.startLng }));
      map.fitBounds(bounds, 64);
    }
  };

  return (
    <button
      type="button"
      onClick={handleRecenter}
      aria-label="Center route on map"
      className="absolute top-3 right-3 z-10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/95 text-[#111315] border border-[#E5E7EB] shadow-sm hover:bg-[#F3F4F6] transition-colors cursor-pointer"
    >
      <LocateFixed className="w-4 h-4" />
    </button>
  );
};

export const RouteMapView: React.FC<RouteMapViewProps> = ({
  runs,
  selectedRun,
  selectedCityFilter,
  onSelectRun,
  onOpenDetail,
}) => {
  const { t, localizeCity, formatDistance, formatPace } = useI18n();
  const [routeStatus, setRouteStatus] = useState<'idle' | 'loading' | 'live' | 'fallback'>('idle');

  const initialCenter = useMemo(() => {
    if (selectedRun) return { lat: selectedRun.startLat, lng: selectedRun.startLng };
    if (runs.length > 0) return { lat: runs[0].startLat, lng: runs[0].startLng };
    return DEFAULT_WORLD_CENTER;
  }, []);

  const waypointList = useMemo(() => {
    if (!selectedRun || !selectedRun.waypoints) return [];
    return selectedRun.waypoints;
  }, [selectedRun]);

  return (
    <div className="relative w-full h-full bg-[#F3F4F6] overflow-hidden">
      <GoogleMap
        defaultCenter={initialCenter}
        defaultZoom={selectedRun ? 14 : 3}
        mapId="DEMO_MAP_ID"
        gestureHandling="greedy"
        streetViewControl={false}
        mapTypeControl={false}
        fullscreenControl={false}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        className="w-full h-full"
      >
        <SelectedRouteLayer
          run={selectedRun}
          selectedCityFilter={selectedCityFilter}
          allRuns={runs}
          onRouteStatus={setRouteStatus}
        />

        {/* Render start markers for all visible runs */}
        {runs.map((run) => {
          const isSelected = selectedRun?.id === run.id;
          return (
            <AdvancedMarker
              key={run.id}
              position={{ lat: run.startLat, lng: run.startLng }}
              zIndex={isSelected ? 30 : 10}
              onClick={() => onSelectRun(run)}
            >
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-transform cursor-pointer select-none ${
                  isSelected
                    ? 'bg-[#E84A27] text-white border-[#C83717] shadow-md scale-105'
                    : 'bg-white text-[#111315] border-[#D1D5DB] shadow-sm hover:border-[#111315]'
                }`}
              >
                <span className="font-mono tabular-nums">{formatDistance(run.distanceKm)}</span>
                {!isSelected && (
                  <span className="max-w-[92px] truncate font-normal text-[#57606A]">
                    {localizeCity(run.city)}
                  </span>
                )}
                {isSelected && <span className="text-[11px] opacity-90">{t('run.startLabel')}</span>}
              </div>
            </AdvancedMarker>
          );
        })}

        {/* Render numbered waypoint pins for the currently selected run */}
        {selectedRun &&
          waypointList.map((wp, idx) => {
            const isLast = idx === waypointList.length - 1;
            const isLoopBack =
              isLast &&
              Math.abs(wp.lat - selectedRun.startLat) < 0.0005 &&
              Math.abs(wp.lng - selectedRun.startLng) < 0.0005;
            if (isLoopBack) return null;

            return (
              <AdvancedMarker
                key={`wp-${selectedRun.id}-${idx}`}
                position={{ lat: wp.lat, lng: wp.lng }}
                zIndex={20}
              >
                <div
                  title={wp.label || `#${idx + 1}`}
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono font-semibold border-2 shadow-sm ${
                    isLast
                      ? 'bg-[#111315] text-white border-white'
                      : 'bg-white text-[#111315] border-[#E84A27]'
                  }`}
                >
                  {isLast ? 'F' : idx + 1}
                </div>
              </AdvancedMarker>
            );
          })}

        <RecenterControl run={selectedRun} runs={runs} />
      </GoogleMap>

      {/* Selected run bottom overlay bar */}
      {selectedRun && (
        <div className="absolute bottom-3 left-3 right-3 z-10 pointer-events-none flex justify-center">
          <div className="pointer-events-auto w-full max-w-xl bg-white/95 backdrop-blur-md border border-[#E5E7EB] rounded-2xl px-4 py-3 shadow-md flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-[#57606A]">
                <span className="font-medium text-[#111315] truncate">
                  {localizeCity(selectedRun.city)}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {formatDistance(selectedRun.distanceKm)}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {formatPace(selectedRun.paceSecPerKm)}
                </span>
              </div>
              <p className="text-sm font-semibold text-[#111315] truncate mt-0.5">
                {selectedRun.title}
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-[#57606A] mt-0.5">
                <Navigation className="w-3 h-3 shrink-0 text-[#E84A27]" />
                <span className="truncate">
                  {routeStatus === 'loading'
                    ? t('run.calculatingRoute')
                    : routeStatus === 'live'
                      ? t('run.routeCalculated')
                      : selectedRun.meetingPoint}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenDetail(selectedRun)}
              className="shrink-0 min-h-[40px] px-3.5 py-2 rounded-xl bg-[#111315] text-white text-xs font-medium hover:bg-[#272B30] transition-colors whitespace-nowrap cursor-pointer"
            >
              {t('run.viewDetails')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
