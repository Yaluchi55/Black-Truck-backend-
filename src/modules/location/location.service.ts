import { prisma } from '../../db/prisma';
import { redis } from '../../infra/redis';
import { env } from '../../config/env';
import { HttpError } from '../../middleware/errors';
export type Coordinate = { lat: number; lng: number };
export class LocationService {
  async updateDriverLocation(driverId: string, point: Coordinate) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || point.lat < -90 || point.lat > 90 || point.lng < -180 || point.lng > 180) throw new HttpError(400, 'Invalid coordinates', 'INVALID_COORDINATES');
    const driver = await prisma.driver.findUnique({ where: { id: driverId }, include: { user: true } });
    if (!driver || !driver.user.isActive || !driver.rtsaPsvCleared) throw new HttpError(403, 'Driver is not cleared to share location', 'DRIVER_NOT_CLEARED');
    await prisma.driver.update({ where: { id: driverId }, data: { currentLat: point.lat, currentLng: point.lng, locationUpdatedAt: new Date() } });
    await redis.geoadd('drivers:geo', point.lng, point.lat, driverId);
    await redis.set(`driver:location:${driverId}`, JSON.stringify({ ...point, at: Date.now() }), 'EX', env.LOCATION_MAX_AGE_SECONDS);
  }
  async nearbyDrivers(point: Coordinate, radiusMeters = 5000, tier?: string) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || point.lat < -90 || point.lat > 90 || point.lng < -180 || point.lng > 180) throw new HttpError(400, 'Invalid coordinates', 'INVALID_COORDINATES');
    if (radiusMeters <= 0 || radiusMeters > env.MAX_MATCH_RADIUS_METERS) throw new HttpError(400, 'Radius is outside permitted range', 'INVALID_RADIUS');
    const safeTier = tier && ['STANDARD','EXECUTIVE','SUV','BLACK_TRUCK'].includes(tier) ? tier : undefined;
    if (tier && !safeTier) throw new HttpError(400, 'Invalid vehicle tier', 'INVALID_VEHICLE_TIER');
    const rows = safeTier
      ? await prisma.$queryRaw<Array<{ id: string; user_id: string; vehicle_tier: string; license_plate: string; distance_m: number }>>`
          SELECT d.id, d.user_id, d.vehicle_tier, d.license_plate,
                 ST_Distance(d.location, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography) AS distance_m
          FROM drivers d JOIN users u ON u.id = d.user_id
          WHERE d.is_online = TRUE AND d.rtsa_psv_cleared = TRUE AND u.is_active = TRUE
            AND d.location IS NOT NULL
            AND d.location_updated_at > NOW() - (${env.LOCATION_MAX_AGE_SECONDS} * INTERVAL '1 second')
            AND d.vehicle_tier::text = ${safeTier}
            AND ST_DWithin(d.location, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography, ${radiusMeters})
          ORDER BY d.location <-> ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography LIMIT 25`
      : await prisma.$queryRaw<Array<{ id: string; user_id: string; vehicle_tier: string; license_plate: string; distance_m: number }>>`
          SELECT d.id, d.user_id, d.vehicle_tier, d.license_plate,
                 ST_Distance(d.location, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography) AS distance_m
          FROM drivers d JOIN users u ON u.id = d.user_id
          WHERE d.is_online = TRUE AND d.rtsa_psv_cleared = TRUE AND u.is_active = TRUE
            AND d.location IS NOT NULL
            AND d.location_updated_at > NOW() - (${env.LOCATION_MAX_AGE_SECONDS} * INTERVAL '1 second')
            AND ST_DWithin(d.location, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography, ${radiusMeters})
          ORDER BY d.location <-> ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography LIMIT 25`;
    return rows;
  }
}
