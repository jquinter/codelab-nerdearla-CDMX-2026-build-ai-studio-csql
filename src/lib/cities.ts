export interface CityPreset {
  id: string;
  name: string;
  countryCode: string;
  center: { lat: number; lng: number };
  zoom: number;
  image: string;
  taglineKey: string;
}

export const REPRESENTATIVE_CITIES: CityPreset[] = [
  {
    id: 'Mexico City',
    name: 'Mexico City',
    countryCode: 'MX',
    center: { lat: 19.4209, lng: -99.1819 },
    zoom: 14,
    image: '/src/assets/images/city_park_run_1795184483635.jpg',
    taglineKey: 'cityTagline.mx',
  },
  {
    id: 'Paris',
    name: 'Paris',
    countryCode: 'FR',
    center: { lat: 48.8548, lng: 2.3225 },
    zoom: 13,
    image: '/src/assets/images/editorial_sunrise_runners_1795184485832.jpg',
    taglineKey: 'cityTagline.fr',
  },
  {
    id: 'London',
    name: 'London',
    countryCode: 'GB',
    center: { lat: 51.5072, lng: -0.1657 },
    zoom: 14,
    image: '/src/assets/images/city_park_run_1795184483635.jpg',
    taglineKey: 'cityTagline.gb',
  },
  {
    id: 'Miami',
    name: 'Miami',
    countryCode: 'US',
    center: { lat: 25.788, lng: -80.128 },
    zoom: 13,
    image: '/src/assets/images/waterfront_tempo_run_1795184484082.jpg',
    taglineKey: 'cityTagline.miami',
  },
  {
    id: 'San Francisco',
    name: 'San Francisco',
    countryCode: 'US',
    center: { lat: 37.8068, lng: -122.456 },
    zoom: 14,
    image: '/src/assets/images/waterfront_tempo_run_1795184484082.jpg',
    taglineKey: 'cityTagline.sf',
  },
  {
    id: 'Rio de Janeiro',
    name: 'Rio de Janeiro',
    countryCode: 'BR',
    center: { lat: -22.9746, lng: -43.2094 },
    zoom: 14,
    image: '/src/assets/images/waterfront_tempo_run_1795184484082.jpg',
    taglineKey: 'cityTagline.rio',
  },
  {
    id: 'São Paulo',
    name: 'São Paulo',
    countryCode: 'BR',
    center: { lat: -23.5874, lng: -46.6576 },
    zoom: 15,
    image: '/src/assets/images/city_park_run_1795184483635.jpg',
    taglineKey: 'cityTagline.sp',
  },
  {
    id: 'Santiago de Chile',
    name: 'Santiago de Chile',
    countryCode: 'CL',
    center: { lat: -33.4068, lng: -70.6042 },
    zoom: 14,
    image: '/src/assets/images/editorial_sunrise_runners_1795184485832.jpg',
    taglineKey: 'cityTagline.cl',
  },
  {
    id: 'Tokyo',
    name: 'Tokyo',
    countryCode: 'JP',
    center: { lat: 35.6852, lng: 139.7528 },
    zoom: 14,
    image: '/src/assets/images/editorial_sunrise_runners_1795184485832.jpg',
    taglineKey: 'cityTagline.jp',
  },
];

export const DEFAULT_WORLD_CENTER = { lat: 20.0, lng: -15.0 };
