import { supabase } from './supabase.js';

export const VAPID_PUBLIC = 'BLwiovNPtkfcoQfd-3CKV13wedlcB-_wl11-zV-Q661cH1Zd1DNZj2CbcedVcE4RuYt1W6oinkss5VeBAI5CBmE';

const b64ToBytes = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const bytesToB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/** 'unsupported' | 'needs-install' | 'denied' | 'default' | 'granted' */
export function pushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  return Notification.permission;
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) || navigator.serviceWorker.register('/sw.js');
}

export async function currentSubscription() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Ask permission (must run from a tap), subscribe this device and save its reminder times. */
export async function enablePush({ household, personId, times }) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { error: 'denied' };
  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC) });
  return saveSubscription(sub, { household, personId, times });
}

export async function saveSubscription(sub, { household, personId, times }) {
  const row = {
    household_id: household,
    person_id: personId,
    endpoint: sub.endpoint,
    p256dh: bytesToB64(sub.getKey('p256dh')),
    auth: bytesToB64(sub.getKey('auth')),
    weigh_at: times.weigh || null,
    meals_at: times.meals || null,
    move_at: times.move || null,
  };
  const { error } = await supabase.from('bh_push_subs').upsert(row, { onConflict: 'endpoint' });
  return error ? { error: 'save' } : { ok: true };
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from('bh_push_subs').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe().catch(() => {});
}

export async function testPush() {
  const { data, error } = await supabase.functions.invoke('bh-remind', { body: { mode: 'test' } });
  return error ? { error: true } : data;
}
