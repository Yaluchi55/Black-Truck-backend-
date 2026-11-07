-- Run after Prisma migrations. Requires PostgreSQL with PostGIS extension installed.
CREATE EXTENSION IF NOT EXISTS postgis;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS location geography(Point, 4326);
CREATE INDEX IF NOT EXISTS drivers_location_gix ON drivers USING GIST (location);
CREATE OR REPLACE FUNCTION sync_driver_location() RETURNS trigger AS $$
BEGIN
  IF NEW.current_lat IS NOT NULL AND NEW.current_lng IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.current_lng, NEW.current_lat), 4326)::geography;
  ELSE
    NEW.location := NULL;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS drivers_location_sync ON drivers;
CREATE TRIGGER drivers_location_sync BEFORE INSERT OR UPDATE OF current_lat, current_lng ON drivers
FOR EACH ROW EXECUTE FUNCTION sync_driver_location();
