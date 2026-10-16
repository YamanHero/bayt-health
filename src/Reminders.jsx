import React, { useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { currentSubscription, disablePush, enablePush, pushState, saveSubscription, testPush } from './push.js';
import { isMinor } from './lib.js';

const ROWS = [
  { key: 'weigh', icon: '⚖️', label: 'الوزن', hint: 'الصبح، إذا ما سجّلت وزن اليوم', def: '07:00', adultOnly: true },
  { key: 'move', icon: '🚶', label: 'الحركة', hint: 'إذا لسا ما وصلت هدف الحركة', def: '18:00' },
  { key: 'meals', icon: '🥗', label: 'الأكل', hint: 'إذا في وجبات ناقصة بالسجل', def: '21:00' },
];

export default function Reminders({ household, people, person, onClose, flash }) {
  const [state, setState] = useState(pushState());
  const [sub, setSub] = useState(null);
  const [personId, setPersonId] = useState(person?.id);
  const [on, setOn] = useState({ weigh: true, move: true, meals: true });
  const [times, setTimes] = useState({ weigh: '07:00', move: '18:00', meals: '21:00' });
  const [busy, setBusy] = useState(false);
  const target = people.find((p) => p.id === personId) ?? person;
  const minor = isMinor(target);

  useEffect(() => {
    (async () => {
      const s = await currentSubscription();
      setSub(s);
      if (!s) return;
      const { data } = await supabase.from('bh_push_subs').select('*').eq('endpoint', s.endpoint).maybeSingle();
      if (data) {
        setPersonId(data.person_id);
        setOn({ weigh: !!data.weigh_at, move: !!data.move_at, meals: !!data.meals_at });
        setTimes((t) => ({ weigh: data.weigh_at?.slice(0, 5) || t.weigh, move: data.move_at?.slice(0, 5) || t.move, meals: data.meals_at?.slice(0, 5) || t.meals }));
      }
    })();
  }, []);

  const chosen = () => Object.fromEntries(ROWS.map((r) => [r.key, on[r.key] && !(r.adultOnly && minor) ? times[r.key] : null]));

  const enable = async () => {
    setBusy(true);
    const r = sub ? await saveSubscription(sub, { household, personId, times: chosen() }) : await enablePush({ household, personId, times: chosen() });
    setBusy(false);
    setState(pushState());
    if (r.error === 'denied') return flash('الإشعارات مسكّرة. فعّلها من إعدادات الآيفون.');
    if (r.error) return flash('ما انحفظت التذكيرات');
    setSub(await currentSubscription());
    flash('التذكيرات مفعّلة ✓');
  };
  const disable = async () => { setBusy(true); await disablePush(); setSub(null); setBusy(false); flash('وقّفت التذكيرات على هالجهاز'); };
  const test = async () => { const r = await testPush(); flash(r?.sent ? 'انبعت إشعار تجربة ✓' : 'ما وصل. تأكد إن الإشعارات مسموحة.'); };

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="التذكيرات">
        <div className="grabber" />
        <div className="row between"><h3>🔔 تذكيرات يومية</h3><button className="icon-btn" onClick={onClose} aria-label="إغلاق">×</button></div>

        {state === 'needs-install' && (
          <div className="stack">
            <p>على الآيفون، الإشعارات بتشتغل بس لما يكون التطبيق على الشاشة الرئيسية:</p>
            <ol className="steps">
              <li>افتح الموقع بـ <b>Safari</b>.</li>
              <li>اكبس زر <b>المشاركة</b> (المربع مع السهم).</li>
              <li>اختار <b>إضافة إلى الشاشة الرئيسية</b>.</li>
              <li>افتح «بيت الصحة» من الأيقونة، وارجع لهون.</li>
            </ol>
          </div>
        )}
        {state === 'unsupported' && <p className="note">هالمتصفح ما بيدعم الإشعارات. جرّب Safari على الآيفون (بعد ما تضيف التطبيق للشاشة الرئيسية) أو Chrome.</p>}
        {state === 'denied' && <p className="note">الإشعارات ممنوعة لهالتطبيق. فعّلها من <b>الإعدادات ← الإشعارات ← بيت الصحة</b>، وارجع لهون.</p>}

        {(state === 'default' || state === 'granted') && (
          <div className="stack">
            <p className="muted small">التذكير بيوصل بس إذا الشغلة لسا ما انعملت. كل جهاز بيتذكّر لشخص واحد.</p>
            {people.length > 1 && (
              <label>التذكيرات لمين على هالجهاز؟
                <select value={personId} onChange={(e) => setPersonId(e.target.value)}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </label>
            )}
            {ROWS.filter((r) => !(r.adultOnly && minor)).map((r) => (
              <div key={r.key} className="rem-row">
                <label className="switch"><input type="checkbox" checked={on[r.key]} onChange={(e) => setOn({ ...on, [r.key]: e.target.checked })} /><span /></label>
                <div className="grow"><b>{r.icon} {r.label}</b><p className="muted small">{r.hint}</p></div>
                <input type="time" value={times[r.key]} disabled={!on[r.key]} onChange={(e) => setTimes({ ...times, [r.key]: e.target.value })} />
              </div>
            ))}
            <button className="btn primary" disabled={busy} onClick={enable}>{busy ? '...' : sub ? 'حفظ' : 'فعّل التذكيرات'}</button>
            {sub && (
              <div className="row gap">
                <button className="btn ghost grow" onClick={test}>جرّب إشعار</button>
                <button className="btn danger grow" disabled={busy} onClick={disable}>أوقف</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
