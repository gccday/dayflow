function getParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23"
  });

  const parts = formatter.formatToParts(date);
  const map = {};
  for (const item of parts) {
    map[item.type] = item.value;
  }

  // Some runtimes may still emit "24:00" at day boundary. Normalize to next-day "00:00".
  if (map.hour === "24") {
    map.hour = "00";
    const y = Number(map.year);
    const m = Number(map.month);
    const d = Number(map.day);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      const shifted = new Date(Date.UTC(y, m - 1, d));
      shifted.setUTCDate(shifted.getUTCDate() + 1);
      map.year = String(shifted.getUTCFullYear()).padStart(4, "0");
      map.month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
      map.day = String(shifted.getUTCDate()).padStart(2, "0");
    }
  }
  return map;
}

function getDateInTz(date, timeZone) {
  const p = getParts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

function getTimeInTz(date, timeZone) {
  const p = getParts(date, timeZone);
  return `${p.hour}:${p.minute}`;
}

function nowInTz(timeZone) {
  const now = new Date();
  return {
    date: getDateInTz(now, timeZone),
    time: getTimeInTz(now, timeZone)
  };
}

function compareHHmm(left, right) {
  const normalize = (value) => {
    const text = String(value || "").trim();
    const match = /^(\d{1,2}):(\d{2})$/.exec(text);
    if (!match) {
      return [0, 0];
    }
    let h = Number(match[1]);
    const m = Number(match[2]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) {
      return [0, 0];
    }
    if (h === 24 && m === 0) {
      h = 0;
    }
    h = Math.max(0, Math.min(23, h));
    return [h, Math.max(0, Math.min(59, m))];
  };
  const [lh, lm] = normalize(left);
  const [rh, rm] = normalize(right);
  if (lh !== rh) {
    return lh - rh;
  }
  return lm - rm;
}

module.exports = {
  getDateInTz,
  getTimeInTz,
  nowInTz,
  compareHHmm
};
