const EARTH_A = 6378245.0;
const EARTH_EE = 0.00669342162296594323;
const X_PI = (Math.PI * 3000.0) / 180.0;

function normalizeCoordSystem(input) {
  const raw = String(input || "auto")
    .trim()
    .toLowerCase();
  if (!raw) {
    return "auto";
  }
  if (raw === "wgs84" || raw === "gcj02" || raw === "bd09" || raw === "auto") {
    return raw;
  }
  throw new Error("invalid coordSystem, expected auto|wgs84|gcj02|bd09");
}

function outOfChina(latitude, longitude) {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function transformLat(x, y) {
  let ret =
    -100.0 +
    2.0 * x +
    3.0 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  ret +=
    ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret +=
    ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret +=
    ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0) /
    3.0;
  return ret;
}

function transformLng(x, y) {
  let ret =
    300.0 +
    x +
    2.0 * y +
    0.1 * x * x +
    0.1 * x * y +
    0.1 * Math.sqrt(Math.abs(x));
  ret +=
    ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret +=
    ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret +=
    ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) /
    3.0;
  return ret;
}

function wgs84ToGcj02(latitude, longitude) {
  if (outOfChina(latitude, longitude)) {
    return { latitude, longitude };
  }
  let dLat = transformLat(longitude - 105.0, latitude - 35.0);
  let dLng = transformLng(longitude - 105.0, latitude - 35.0);
  const radLat = (latitude / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - EARTH_EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((EARTH_A * (1 - EARTH_EE)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180.0) / ((EARTH_A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return {
    latitude: latitude + dLat,
    longitude: longitude + dLng
  };
}

function gcj02ToWgs84(latitude, longitude) {
  if (outOfChina(latitude, longitude)) {
    return { latitude, longitude };
  }
  const gcj = wgs84ToGcj02(latitude, longitude);
  return {
    latitude: latitude * 2 - gcj.latitude,
    longitude: longitude * 2 - gcj.longitude
  };
}

function gcj02ToBd09(latitude, longitude) {
  const z = Math.sqrt(longitude * longitude + latitude * latitude) + 0.00002 * Math.sin(latitude * X_PI);
  const theta = Math.atan2(latitude, longitude) + 0.000003 * Math.cos(longitude * X_PI);
  return {
    latitude: z * Math.sin(theta) + 0.006,
    longitude: z * Math.cos(theta) + 0.0065
  };
}

function bd09ToGcj02(latitude, longitude) {
  const x = longitude - 0.0065;
  const y = latitude - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
  return {
    latitude: z * Math.sin(theta),
    longitude: z * Math.cos(theta)
  };
}

function bd09ToWgs84(latitude, longitude) {
  const gcj = bd09ToGcj02(latitude, longitude);
  return gcj02ToWgs84(gcj.latitude, gcj.longitude);
}

function resolveProfileCoordSystem(profile) {
  return normalizeCoordSystem(profile && profile.coord_system ? profile.coord_system : "auto");
}

function toBrowserWgs84(profile) {
  const latitude = Number(profile.latitude);
  const longitude = Number(profile.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("invalid location profile coordinates");
  }

  const inputCoordSystem = resolveProfileCoordSystem(profile);
  if (inputCoordSystem === "wgs84") {
    return {
      latitude,
      longitude,
      inputCoordSystem,
      appliedCoordSystem: "wgs84"
    };
  }
  if (inputCoordSystem === "gcj02") {
    const converted = gcj02ToWgs84(latitude, longitude);
    return {
      latitude: converted.latitude,
      longitude: converted.longitude,
      inputCoordSystem,
      appliedCoordSystem: "gcj02->wgs84"
    };
  }
  if (inputCoordSystem === "bd09") {
    const converted = bd09ToWgs84(latitude, longitude);
    return {
      latitude: converted.latitude,
      longitude: converted.longitude,
      inputCoordSystem,
      appliedCoordSystem: "bd09->wgs84"
    };
  }

  if (outOfChina(latitude, longitude)) {
    return {
      latitude,
      longitude,
      inputCoordSystem: "auto",
      appliedCoordSystem: "auto:wgs84"
    };
  }
  const converted = gcj02ToWgs84(latitude, longitude);
  return {
    latitude: converted.latitude,
    longitude: converted.longitude,
    inputCoordSystem: "auto",
    appliedCoordSystem: "auto:gcj02->wgs84"
  };
}

module.exports = {
  normalizeCoordSystem,
  resolveProfileCoordSystem,
  toBrowserWgs84,
  outOfChina,
  wgs84ToGcj02,
  gcj02ToWgs84,
  gcj02ToBd09,
  bd09ToGcj02,
  bd09ToWgs84
};
