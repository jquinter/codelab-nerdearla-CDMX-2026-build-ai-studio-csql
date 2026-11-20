import React, { useEffect, useRef } from 'react';
import {
  AdvancedMarker,
  Map as GoogleMap,
  MapMouseEvent,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { RouteWaypoint } from '../types/run';
import { useI18n } from '../contexts/I18nContext';

interface RouteBuilderMapProps {
  center: { lat: number; lng: number };
  startPoint: { lat: number; lng: number } | null;
  waypoints: RouteWaypoint[];
  onMapClick: (coords: { lat: number; lng: number }) => void;
  onDistanceComputed: (distanceKm: number, mode: 'live' | 'fallback') => void;
}

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

const BuilderCameraAndRoute: React.FC<{
  center: { lat: number; lng: number };
  startPoint: { lat: number; lng: number } | null;
  waypoints: RouteWaypoint[];
  onDistanceComputed: (distanceKm: number, mode: 'live' | 'fallback') => void;
}> = ({ center, startPoint, waypoints, onDistanceComputed }) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const mapsLib = useMapsLibrary('maps');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const lastCenterRef = useRef<string>('');

  useEffect(() => {
    if (!map) return;
    const key = `${center.lat.toFixed(4)},${center.lng.toFixed(4)}`;
    if (key !== lastCenterRef.current) {
      lastCenterRef.current = key;
      map.panTo(center);
      map.setZoom(14);
    }
  }, [map, center]);

  useEffect(() => {
    if (!map) return;

    const clearPolylines = () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };

    if (!startPoint || waypoints.length === 0) {
      clearPolylines();
      return;
    }

    const allPoints = [startPoint, ...waypoints];
    let cancelled = false;

    const drawFallback = () => {
      clearPolylines();
      if (mapsLib) {
        const poly = new mapsLib.Polyline({
          path: allPoints,
          strokeColor: '#E84A27',
          strokeOpacity: 0.9,
          strokeWeight: 4,
          map,
        });
        polylinesRef.current = [poly];
      }
      let totalKm = 0;
      for (let i = 1; i < allPoints.length; i += 1) {
        totalKm += haversineKm(allPoints[i - 1], allPoints[i]);
      }
      if (totalKm > 0.05) {
        onDistanceComputed(Math.round(totalKm * 10) / 10, 'fallback');
      }
    };

    if (!routesLib || !(routesLib as any).Route?.computeRoutes) {
      drawFallback();
      return () => clearPolylines();
    }

    const origin = allPoints[0];
    const destination = allPoints[allPoints.length - 1];
    const intermediates = allPoints.slice(1, -1).map((pt) => ({ location: pt }));

    // Modern Routes API JS SDK wrapper
    // Docs: https://developers.google.com/maps/documentation/javascript/routes?utm_campaign=gmp_mcp_codeassist_v1_aistudio
    (routesLib as any).Route.computeRoutes({
      origin,
      destination,
      ...(intermediates.length > 0 ? { intermediates } : {}),
      travelMode: 'WALKING',
      fields: ['path', 'distanceMeters'],
    })
      .then((res: any) => {
        if (cancelled) return;
        const primaryRoute = res?.routes?.[0];
        if (!primaryRoute) {
          drawFallback();
          return;
        }
        clearPolylines();
        if (typeof primaryRoute.createPolylines === 'function') {
          const rendered: google.maps.Polyline[] = primaryRoute.createPolylines();
          rendered.forEach((poly) => {
            poly.setOptions({
              strokeColor: '#E84A27',
              strokeWeight: 5,
              strokeOpacity: 0.92,
            });
            poly.setMap(map);
          });
          polylinesRef.current = rendered;
        } else {
          drawFallback();
        }
        if (typeof primaryRoute.distanceMeters === 'number' && primaryRoute.distanceMeters > 50) {
          onDistanceComputed(
            Math.round((primaryRoute.distanceMeters / 1000) * 10) / 10,
            'live',
          );
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        const msg = String(err?.message ?? err ?? '');
        if (
          err?.status === 429 ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        drawFallback();
      });

    return () => {
      cancelled = true;
      clearPolylines();
    };
  }, [map, routesLib, mapsLib, startPoint, waypoints, onDistanceComputed]);

  return null;
};

export const RouteBuilderMap: React.FC<RouteBuilderMapProps> = ({
  center,
  startPoint,
  waypoints,
  onMapClick,
  onDistanceComputed,
}) => {
  const { t } = useI18n();

  const handleClick = (event: MapMouseEvent) => {
    const latLng = event.detail.latLng;
    if (!latLng) return;
    onMapClick({ lat: latLng.lat, lng: latLng.lng });
  };

  return (
    <div className="w-full h-full min-h-[280px] rounded-xl overflow-hidden border border-[#E5E7EB] relative bg-[#F3F4F6]">
      <GoogleMap
        defaultCenter={center}
        defaultZoom={14}
        mapId="DEMO_MAP_ID"
        gestureHandling="greedy"
        streetViewControl={false}
        mapTypeControl={false}
        fullscreenControl={false}
        onClick={handleClick}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        className="w-full h-full"
      >
        <BuilderCameraAndRoute
          center={center}
          startPoint={startPoint}
          waypoints={waypoints}
          onDistanceComputed={onDistanceComputed}
        />

        {startPoint && (
          <AdvancedMarker position={startPoint} zIndex={30}>
            <div className="px-2.5 py-1 rounded-lg bg-[#E84A27] text-white text-xs font-semibold border border-[#C83717] shadow-md">
              {t('run.startLabel')}
            </div>
          </AdvancedMarker>
        )}

        {waypoints.map((wp, idx) => {
          const isLast = idx === waypoints.length - 1;
          const isLoopBack =
            isLast &&
            startPoint &&
            Math.abs(wp.lat - startPoint.lat) < 0.0004 &&
            Math.abs(wp.lng - startPoint.lng) < 0.0004;
          if (isLoopBack) return null;

          return (
            <AdvancedMarker
              key={`builder-wp-${idx}`}
              position={{ lat: wp.lat, lng: wp.lng }}
              zIndex={20}
            >
              <div
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
      </GoogleMap>
    </div>
  );
};
