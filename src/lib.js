import { supabase } from './supabase.js';

export const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDate(d); };
export const fmtDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('ar', { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtShort = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('ar', { day: 'numeric', month: 'short' });
export const fmtWeekday = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('ar', { weekday: 'long' });
export const fmtKg = (n) => (n == null ? '—' : Number(n).toLocaleString('ar', { maximumFractionDigits: 1 }));
export const ageOf = (p) => (p?.birth_year ? new Date().getFullYear() - p.birth_year : null);
export const isMinor = (p) => { const a = ageOf(p); return a != null && a < 18; };
export const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export function defaultSlot() {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 18 ? 'snack' : 'dinner';
}

const AI_ERRORS = {
  quota: 'وصلت للحد اليومي للمدرب (25 طلب). جرّب بكرا.',
  ai_not_configured: 'المدرب الذكي مش مفعّل بعد.',
  ai_busy: 'المدرب مشغول هلّق، جرّب بعد دقيقة.',
  ai_key_invalid: 'في مشكلة بمفتاح الذكاء الاصطناعي.',
};

/** Calls the coach function. Returns { result } or { error: message }. */
export async function coach(body) {
  const { data, error } = await supabase.functions.invoke('bh-coach', { body: { today: isoDate(), local_time: nowHM(), ...body } });
  if (error) {
    let code = '';
    try { code = (await error.context.json()).error; } catch { /* ignore */ }
    return { error: AI_ERRORS[code] || 'صار خطأ، جرّب مرة ثانية.' };
  }
  return { result: data.result };
}

/** Downscale a photo to a JPEG (max 1024px) and return base64 without the data: prefix. */
export function imageToBase64(file, max = 1024) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve({ base64: c.toDataURL('image/jpeg', 0.82).split(',')[1], preview: c.toDataURL('image/jpeg', 0.6) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

/** Consecutive days (ending today or yesterday) that have at least one record. */
export function streakOf(dates) {
  const set = new Set(dates);
  let d = isoDate();
  if (!set.has(d)) d = addDays(d, -1);
  let n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
