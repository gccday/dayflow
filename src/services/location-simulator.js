const EARTH_RADIUS_M = 6378137;
const { toBrowserWgs84 } = require("./coord-system");

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function normalizeHeading(heading) {
  if (heading === null || heading === undefined || Number.isNaN(Number(heading))) {
    return null;
  }
  const h = Number(heading) % 360;
  return h < 0 ? h + 360 : h;
}

function offsetByMeters(latitude, longitude, distanceMeters, bearingRad) {
  const latRad = (latitude * Math.PI) / 180;
  const lngRad = (longitude * Math.PI) / 180;

  const newLatRad =
    Math.asin(
      Math.sin(latRad) * Math.cos(distanceMeters / EARTH_RADIUS_M) +
        Math.cos(latRad) * Math.sin(distanceMeters / EARTH_RADIUS_M) * Math.cos(bearingRad)
    );

  const newLngRad =
    lngRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(distanceMeters / EARTH_RADIUS_M) * Math.cos(latRad),
      Math.cos(distanceMeters / EARTH_RADIUS_M) - Math.sin(latRad) * Math.sin(newLatRad)
    );

  return {
    latitude: (newLatRad * 180) / Math.PI,
    longitude: (newLngRad * 180) / Math.PI
  };
}

function simulateLocation(profile) {
  const basePoint = toBrowserWgs84(profile);
  const minRadius = 20;
  const maxRadius = 40;
  const jitterRadiusM = randomBetween(minRadius, maxRadius);
  const bearing = randomBetween(0, Math.PI * 2);
  const offset = offsetByMeters(basePoint.latitude, basePoint.longitude, jitterRadiusM, bearing);

  const baseAccuracy = profile.accuracy || 30;
  const baseAltitude = profile.altitude ?? null;
  const baseAltitudeAccuracy = profile.altitude_accuracy ?? null;
  const baseHeading = profile.heading ?? null;
  const baseSpeed = profile.speed ?? null;

  const simulated = {
    latitude: Number(offset.latitude.toFixed(7)),
    longitude: Number(offset.longitude.toFixed(7)),
    accuracy: Number(Math.max(5, baseAccuracy + randomBetween(-2.5, 2.5)).toFixed(2)),
    altitude:
      baseAltitude === null ? null : Number((Number(baseAltitude) + randomBetween(-1.2, 1.2)).toFixed(2)),
    altitudeAccuracy:
      baseAltitudeAccuracy === null
        ? null
        : Number(Math.max(0.5, Number(baseAltitudeAccuracy) + randomBetween(-0.8, 0.8)).toFixed(2)),
    heading:
      baseHeading === null ? null : Number(normalizeHeading(Number(baseHeading) + randomBetween(-8, 8)).toFixed(2)),
    speed: baseSpeed === null ? null : Number(Math.max(0, Number(baseSpeed) + randomBetween(-0.2, 0.2)).toFixed(2)),
    jitterRadiusM: Number(jitterRadiusM.toFixed(2)),
    inputCoordSystem: basePoint.inputCoordSystem,
    appliedCoordSystem: basePoint.appliedCoordSystem,
    sourceLatitude: Number(profile.latitude),
    sourceLongitude: Number(profile.longitude)
  };

  return simulated;
}

module.exports = {
  simulateLocation
};
