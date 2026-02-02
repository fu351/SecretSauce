/**
 * TypeScript types for routing functionality
 */

export type TravelMode = "driving" | "walking"

export interface LatLng {
  lat: number
  lng: number
}

export interface RouteResult {
  polyline: LatLng[]
  distance: number // miles
  duration: number // seconds
  durationText: string
}

export interface RoutingConfig {
  serviceUrl: string
  profile: "car" | "foot"
  timeout: number
  retries: number
}

export interface RouteWaypoint {
  latLng: LatLng
  name?: string
}

export interface RouteLine {
  coordinates: LatLng[]
  color: string
  weight: number
  opacity: number
}

export interface TravelTimeInfo {
  storeIndex: number
  storeName: string
  distance: number
  distanceText: string
  duration: number
  durationText: string
}

// OSRM API response types
export interface OSRMRoute {
  geometry: string // polyline encoded
  distance: number // meters
  duration: number // seconds
  legs: Array<{
    distance: number
    duration: number
    steps: Array<{
      distance: number
      duration: number
      name: string
      maneuver: {
        type: string
        location: [number, number] // [lng, lat]
      }
    }>
  }>
}

export interface OSRMRouteResponse {
  code: string
  routes: OSRMRoute[]
  waypoints: Array<{
    hint: string
    distance: number
    name: string
    location: [number, number] // [lng, lat]
  }>
}
