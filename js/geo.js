// Approximate street-level address from OpenStreetMap Nominatim.
// Data © OpenStreetMap contributors (ODbL); views show the credit when it is used.
import { getLang } from './i18n.js';
import { LIMITS } from './data.js';
import { CONFIG } from './config.js';

const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const CACHE_KEY = 'jk.v1.geo';
const CACHE_MAX = 100;
const TIMEOUT_MS = 8000;
const MIN_GAP_MS = 1000; // Nominatim usage policy: at most 1 request per second

let queue = Promise.resolve();
let lastRequest = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs `task` after the previous one, at least MIN_GAP_MS after the last request started.
function throttled(task) {
  const run = queue.then(async () => {
    const wait = lastRequest + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    return task();
  });
  queue = run.catch(() => {});
  return run;
}

function readCache() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(CACHE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(key, value) {
  try {
    const cache = readCache();
    delete cache[key];
    cache[key] = value;
    const keys = Object.keys(cache);
    for (const old of keys.slice(0, Math.max(0, keys.length - CACHE_MAX))) delete cache[old];
    globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Caching is optional.
  }
}

const tidy = (text) => (typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '');

/** 'Jalan Talaga Bodas' → 'Jl. Talaga Bodas'; 'Kota Bandung' → 'Bandung'. No house number. */
function shortAddress(address) {
  if (!address || typeof address !== 'object') return null;
  const road = tidy(address.road || address.pedestrian || address.footway || address.residential)
    .replace(/^Jalan\s+/i, 'Jl. ');
  const area = tidy(address.suburb || address.village || address.neighbourhood || address.quarter || address.city_district);
  const city = tidy(address.city || address.town || address.municipality || address.county)
    .replace(/^Kota\s+/i, '');

  const parts = [];
  for (const part of [road, area, city]) {
    if (part && !parts.some((p) => p.toLowerCase() === part.toLowerCase())) parts.push(part);
  }
  if (!parts.length) return null;
  return Array.from(parts.join(', ')).slice(0, LIMITS.address).join('').trim();
}

async function reverse(lat, lng, lang) {
  const url = `${ENDPOINT}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&accept-language=${lang}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    return shortAddress(data?.address);
  } finally {
    clearTimeout(timer);
  }
}

/** A short street-level address for the coordinates, or null on any failure (or when switched off in config.js). */
export async function approxAddress(lat, lng, lang = getLang()) {
  if (!CONFIG.addressLookup) return null;
  try {
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
    const l = lang === 'en' ? 'en' : 'id';
    const [rLat, rLng] = [la.toFixed(5), lo.toFixed(5)];
    const key = `${rLat},${rLng},${l}`;

    const cached = readCache()[key];
    if (typeof cached === 'string' && cached) return cached;

    const address = await throttled(() => reverse(rLat, rLng, l));
    if (address) writeCache(key, address);
    return address;
  } catch {
    return null;
  }
}
