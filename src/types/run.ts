export interface RouteWaypoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface RunAttendee {
  id: number;
  uid: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface RunItem {
  id: number;
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
  createdAt: string;
  host: {
    id: number;
    uid: string;
    displayName: string;
    avatarUrl: string | null;
  };
  attendees: RunAttendee[];
  attendeeCount: number;
  isJoined: boolean;
  isHost: boolean;
}
