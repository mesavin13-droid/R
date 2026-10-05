import { RoadEvent, RoutePlan, RouteRisk } from '../types';

export class RoutingService {
  /**
   * Calculate route using public OSRM engine with resilient fallback
   */
  static async calculateRoute(
    fromCoords: [number, number],
    toCoords: [number, number],
    fromAddress: string,
    toAddress: string,
    activeEvents: RoadEvent[]
  ): Promise<RoutePlan> {
    const [fromLat, fromLng] = fromCoords;
    const [toLat, toLng] = toCoords;

    let coordinates: [number, number][] = [];
    let distanceKm = 0;
    let durationMinutes = 0;

    try {
      // OSRM coordinates are in lng,lat format
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
      const response = await fetch(osrmUrl);

      if (response.ok) {
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          distanceKm = Math.round((route.distance / 1000) * 10) / 10;
          durationMinutes = Math.round(route.duration / 60);
          // OSRM returns coordinates as [lng, lat]
          coordinates = route.geometry.coordinates.map((pt: [number, number]) => [pt[1], pt[0]]);
        }
      }
    } catch (e) {
      console.warn('OSRM routing failed, using fallback interpolation', e);
    }

    // Fallback: Generate intermediate points along direct path
    if (coordinates.length === 0) {
      const steps = 15;
      for (let i = 0; i <= steps; i++) {
        const ratio = i / steps;
        const lat = fromLat + (toLat - fromLat) * ratio;
        const lng = fromLng + (toLng - fromLng) * ratio;
        coordinates.push([lat, lng]);
      }
      const directDist = Math.hypot(toLat - fromLat, toLng - fromLng) * 111; // approx km
      distanceKm = Math.round(directDist * 1.3 * 10) / 10; // road winding factor
      durationMinutes = Math.round((distanceKm / 35) * 60); // 35 km/h urban average
    }

    // Analyze events along the route (within ~400 meters of any point in route)
    const risks: RouteRisk[] = [];
    const thresholdKm = 0.4; // 400m

    activeEvents.forEach((ev) => {
      // Find minimum distance from event to any segment of route
      let minDistance = Infinity;
      let minIndex = 0;

      coordinates.forEach(([pLat, pLng], idx) => {
        const dist = Math.hypot(pLat - ev.latitude, pLng - ev.longitude) * 111;
        if (dist < minDistance) {
          minDistance = dist;
          minIndex = idx;
        }
      });

      if (minDistance <= thresholdKm) {
        let delay = 0;
        let severity: 'low' | 'medium' | 'high' = 'medium';

        switch (ev.type) {
          case 'crossing':
            delay = ev.subType === 'closed' ? 12 : 5;
            severity = 'high';
            break;
          case 'accident':
            delay = ev.subType === 'road_blocked' ? 18 : 7;
            severity = 'high';
            break;
          case 'road':
            delay = ev.subType === 'closure' ? 15 : 4;
            severity = ev.subType === 'closure' ? 'high' : 'medium';
            break;
          case 'patrol':
            delay = 1;
            severity = 'low';
            break;
          case 'hazard':
            delay = 6;
            severity = 'medium';
            break;
          default:
            delay = 2;
            severity = 'low';
        }

        const distanceFromStartKm = Math.round((minIndex / coordinates.length) * distanceKm * 10) / 10;

        risks.push({
          id: `risk-${ev.id}`,
          eventId: ev.id,
          type: ev.type,
          title: ev.title,
          address: ev.address,
          distanceFromStartKm,
          estimatedDelayMinutes: delay,
          severity,
        });
      }
    });

    // Sort risks by distance along route
    risks.sort((a, b) => a.distanceFromStartKm - b.distanceFromStartKm);

    // Add delays to duration
    const totalDelay = risks.reduce((acc, r) => acc + r.estimatedDelayMinutes, 0);
    durationMinutes += totalDelay;

    return {
      fromAddress,
      toAddress,
      fromCoords,
      toCoords,
      distanceKm,
      durationMinutes,
      coordinates,
      risks,
    };
  }
}
