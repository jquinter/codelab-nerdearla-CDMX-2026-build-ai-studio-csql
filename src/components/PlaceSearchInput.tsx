import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { MapPin, Search, Loader2 } from 'lucide-react';

export interface SelectedPlaceResult {
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  city?: string;
  countryCode?: string;
}

interface PlaceSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelectPlace: (place: SelectedPlaceResult) => void;
  placeholder: string;
  language?: string;
}

export const PlaceSearchInput: React.FC<PlaceSearchInputProps> = ({
  value,
  onChange,
  onSelectPlace,
  placeholder,
  language,
}) => {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const fetchSuggestions = useCallback(
    (input: string) => {
      if (!placesLib || input.trim().length < 2) {
        setSuggestions([]);
        setIsLoading(false);
        return;
      }

      const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new AutocompleteSessionToken();
      }

      setIsLoading(true);
      // Modern Places API (New) AutocompleteSuggestion with session token
      // Docs: https://developers.google.com/maps/documentation/javascript/place-autocomplete-data?utm_campaign=gmp_mcp_codeassist_v1_aistudio
      AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: input.trim(),
        sessionToken: sessionTokenRef.current,
        ...(language ? { language } : {}),
      })
        .then((res) => {
          setSuggestions(res?.suggestions ?? []);
          setIsOpen(true);
          setIsLoading(false);
        })
        .catch((err: any) => {
          setIsLoading(false);
          setSuggestions([]);
          const msg = String(err?.message ?? err ?? '');
          if (
            err?.status === 429 ||
            msg.includes('RESOURCE_EXHAUSTED') ||
            msg.includes('OVER_QUERY_LIMIT')
          ) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
        });
    },
    [placesLib, language],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    onChange(nextVal);
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      fetchSuggestions(nextVal);
    }, 260);
  };

  const handlePickSuggestion = async (
    suggestion: google.maps.places.AutocompleteSuggestion,
  ) => {
    if (!suggestion.placePrediction) return;
    setIsOpen(false);
    setIsLoading(true);
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location', 'addressComponents'],
      });

      const loc = place.location;
      if (loc) {
        const lat = typeof loc.lat === 'function' ? loc.lat() : (loc as any).lat;
        const lng = typeof loc.lng === 'function' ? loc.lng() : (loc as any).lng;

        let city: string | undefined;
        let countryCode: string | undefined;
        const comps = (place as any).addressComponents as
          | Array<{ types: string[]; longText?: string; shortText?: string }>
          | undefined;

        if (Array.isArray(comps)) {
          const locality = comps.find(
            (c) =>
              c.types?.includes('locality') ||
              c.types?.includes('administrative_area_level_1'),
          );
          const country = comps.find((c) => c.types?.includes('country'));
          city = locality?.longText;
          countryCode = country?.shortText;
        }

        const displayName =
          place.displayName ||
          suggestion.placePrediction.mainText?.text ||
          suggestion.placePrediction.text.text;

        onChange(displayName);
        onSelectPlace({
          name: displayName,
          formattedAddress: place.formattedAddress || displayName,
          lat,
          lng,
          city,
          countryCode,
        });
      }
    } catch (err: any) {
      console.warn('Place fetchFields error:', err);
      const msg = String(err?.message ?? err ?? '');
      if (
        err?.status === 429 ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('OVER_QUERY_LIMIT')
      ) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
    } finally {
      sessionTokenRef.current = null;
      setSuggestions([]);
      setIsLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-[#57606A] absolute left-3.5 pointer-events-none" />
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full min-h-[44px] pl-10 pr-9 py-2.5 rounded-xl border border-[#D1D5DB] bg-white text-sm text-[#111315] placeholder:text-[#8C959F] focus:outline-none focus:border-[#111315] transition-colors"
        />
        {isLoading && (
          <Loader2 className="w-4 h-4 text-[#57606A] animate-spin absolute right-3" />
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-30 mt-1.5 w-full bg-white border border-[#E5E7EB] rounded-xl shadow-lg max-h-60 overflow-y-auto py-1">
          {suggestions.map((item, idx) => {
            const pred = item.placePrediction;
            if (!pred) return null;
            return (
              <li key={pred.placeId || idx}>
                <button
                  type="button"
                  onClick={() => handlePickSuggestion(item)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-[#F3F4F6] flex items-start gap-2.5 transition-colors cursor-pointer"
                >
                  <MapPin className="w-4 h-4 text-[#E84A27] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#111315] truncate">
                      {pred.mainText?.text || pred.text.text}
                    </p>
                    {pred.secondaryText?.text && (
                      <p className="text-xs text-[#57606A] truncate">
                        {pred.secondaryText.text}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
