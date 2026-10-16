import React, { useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { SLOTS, KINDS } from './data.js';
import { coach, defaultSlot, imageToBase64, isMinor, isoDate } from './lib.js';

const MODES = [
  { id: 'meal', label: 'وجبة', icon: '🍽️' },
  { id: 'weight', label: 'وزن', icon: '⚖️' },
  { id: 'move', label: 'حركة', icon: '🚶' },
];

export default function QuickAdd({ household, person, initial = 'meal', onClose, onSaved, flash }) {
  const [mode, setMode] = useState(initial);
  const minor = isMinor(person);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="تسجيل سريع">
        <div className="grabber" />
        <div className="row between">
          <h3>تسجيل سريع · {person.name}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="إغلاق">×</button>
        </div>
        <div className="seg seg3">
          {MODES.map((m) => (
            <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>{m.icon} {m.label}</button>
          ))}
        </div>
        {mode === 'meal' && <MealAdd household={household} person={person} minor={minor} onSaved={onSaved} flash={flash} />}
        {mode === 'weight' && <WeightAdd household={household} person={person} onSaved={onSaved} flash={flash} />}
        {mode === 'move' && <MoveAdd household={household} person={person} minor={minor} onSaved={onSaved} flash={flash} />}
      </div>
    </div>
  );
}

function MealAdd({ household, person, minor, onSaved, flash }) {
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState(null);
  const [note, setNote] = useState('');
  const fileRef = useRef(null);

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try { setPhoto(await imageToBase64(f)); } catch { flash('ما قدرنا نقرأ الصورة'); }
  };

  const analyse = async () => {
    if (!text.trim() && !photo) return flash('اكتب شو أكلت أو صوّر الصحن');
    setBusy(true); setEntries(null); setNote('');
    const { result, error } = await coach({ mode: 'parse', person_id: person.id, question: text.trim(), image: photo?.base64 });
    setBusy(false);
    if (error) return flash(error);
    if (result.unclear || !result.entries?.length) return flash('ما وضحت الوجبة. جرّب صورة أوضح أو اكتب جملة.');
    setEntries(result.entries.map((x) => ({ ...x, kcal: minor ? null : x.kcal })));
    setNote(result.note || '');
  };

  const save = async (list, source) => {
    const rows = list.filter((x) => x.description?.trim()).map((x) => ({
      household_id: household, person_id: person.id, eaten_on: isoDate(), slot: x.slot,
      description: x.description.trim().slice(0, 400),
      kcal: minor || x.kcal == null || x.kcal === '' ? null : Math.max(0, Math.min(5000, Number(x.kcal) || 0)),
      protein_g: x.protein_g == null || x.protein_g === '' ? null : Math.max(0, Math.min(400, Number(x.protein_g) || 0)),
      source,
    }));
    if (!rows.length) return;
    const { error } = await supabase.from('bh_meals').insert(rows);
    if (error) return flash('ما انحفظ');
    flash(rows.length > 1 ? `انسجلت ${rows.length} وجبات ✓` : 'انسجلت ✓');
    onSaved();
  };

  const upd = (i, patch) => setEntries((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  if (entries) {
    return (
      <div className="stack">
        {note && <p className="tipbox small">{note}</p>}
        {entries.map((x, i) => (
          <div key={i} className="entry">
            <div className="row gap">
              <select value={x.slot} onChange={(e) => upd(i, { slot: e.target.value })} aria-label="الوجبة">
                {SLOTS.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
              </select>
              {!minor && <label className="kcal-in"><input inputMode="numeric" dir="ltr" value={x.kcal ?? ''} onChange={(e) => upd(i, { kcal: e.target.value.replace(/\D/g, '') })} aria-label="سعرات" /><span>سعرة</span></label>}
              <button className="x" onClick={() => setEntries((l) => l.filter((_, j) => j !== i))} aria-label="حذف">×</button>
            </div>
            <textarea rows="2" value={x.description} onChange={(e) => upd(i, { description: e.target.value })} />
          </div>
        ))}
        <p className="muted small">الأرقام تقديرية. عدّل اللي بدك قبل الحفظ.</p>
        <div className="row gap">
          <button className="btn primary grow" onClick={() => save(entries, 'ai')}>حفظ</button>
          <button className="btn ghost" onClick={() => setEntries(null)}>رجوع</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <label>شو أكلت؟<textarea rows="3" placeholder="مثلاً: صحن مجدّرة وسلطة وكاسة لبن على الغدا" value={text} onChange={(e) => setText(e.target.value)} /></label>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
      {photo ? (
        <div className="photo-prev">
          <img src={photo.preview} alt="صورة الوجبة" />
          <button className="x on-img" onClick={() => setPhoto(null)} aria-label="إزالة الصورة">×</button>
        </div>
      ) : (
        <button className="btn ghost" onClick={() => fileRef.current?.click()}>📷 صوّر الصحن أو اختار صورة</button>
      )}
      <button className="btn primary" disabled={busy} onClick={analyse}>{busy ? 'المدرب بيحلّل...' : '✨ حلّل وسجّل'}</button>
      {text.trim() && !photo && (
        <button className="btn plain-link" disabled={busy} onClick={() => save([{ slot: defaultSlot(), description: text }], 'manual')}>حفظ النص مثل ما هو، بدون تحليل</button>
      )}
    </div>
  );
}

function WeightAdd({ household, person, onSaved, flash }) {
  const [kg, setKg] = useState('');
  const save = async (e) => {
    e.preventDefault();
    const v = parseFloat(String(kg).replace(',', '.'));
    if (!(v > 10 && v < 400)) return flash('رقم الوزن مش منطقي');
    const { error } = await supabase.from('bh_weights').insert({ household_id: household, person_id: person.id, kg: v, measured_on: isoDate() });
    if (error) return flash('ما انحفظ');
    flash('انحفظ ✓'); onSaved();
  };
  return (
    <form className="stack" onSubmit={save}>
      <label>وزن اليوم (كغ)<input className="big-input" inputMode="decimal" dir="ltr" placeholder="72.0" autoFocus value={kg} onChange={(e) => setKg(e.target.value)} /></label>
      <p className="muted small">أفضل وقت: الصبح بعد الحمّام وقبل الفطور.</p>
      <button className="btn primary">حفظ</button>
    </form>
  );
}

function MoveAdd({ household, person, minor, onSaved, flash }) {
  const [kind, setKind] = useState('walk');
  const [minutes, setMinutes] = useState(30);
  const save = async () => {
    const { error } = await supabase.from('bh_workouts').insert({ household_id: household, person_id: person.id, kind, minutes, done_on: isoDate() });
    if (error) return flash('ما انحفظ');
    flash('يعطيك العافية 💪'); onSaved();
  };
  return (
    <div className="stack">
      <div className="kinds">
        {KINDS.map((k) => <button type="button" key={k.id} className={kind === k.id ? 'on' : ''} onClick={() => setKind(k.id)}><span>{k.icon}</span>{k.label}</button>)}
      </div>
      <div className="chips">
        {[15, 30, 45, 60, 90].map((m) => <button key={m} className={'chip' + (minutes === m ? ' on solid' : '')} onClick={() => setMinutes(m)}>{m} د</button>)}
      </div>
      <p className="muted small">{minor ? 'الهدف: ساعة حركة باليوم.' : 'الهدف: 30 دقيقة باليوم.'}</p>
      <button className="btn primary" onClick={save}>حفظ {minutes} دقيقة</button>
    </div>
  );
}
