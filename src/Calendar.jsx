import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';
import { addDays, fmtDate, isoDate, pad } from './lib.js';

export const MARKS = [
  { id: 'no_sugar', label: 'بدون سكر', short: 'سكر', icon: '🚫🍬', color: '#0f766e', counted: false },
  { id: 'qada_fast', label: 'قضاء صيام', short: 'صيام', icon: '🌙', color: '#7c3aed', counted: false },
  { id: 'qada_prayer', label: 'قضاء صلاة', short: 'صلاة', icon: '🕌', color: '#b45309', counted: true },
];
const markOf = (id) => MARKS.find((m) => m.id === id);
const WEEK = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];

const hijriFmt = (() => {
  try { return new Intl.DateTimeFormat('ar-u-ca-islamic-umalqura-nu-latn', { day: 'numeric' }); } catch { return null; }
})();
const hijriMonthFmt = (() => {
  try { return new Intl.DateTimeFormat('ar-u-ca-islamic-umalqura', { month: 'long', year: 'numeric' }); } catch { return null; }
})();
const hijriDay = (iso) => (hijriFmt ? hijriFmt.format(new Date(iso + 'T12:00:00')).replace(/[^\d]/g, '') : '');
const hijriMonth = (iso) => (hijriMonthFmt ? hijriMonthFmt.format(new Date(iso + 'T12:00:00')) : '');

const monthStart = (iso) => iso.slice(0, 8) + '01';
const shiftMonth = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(1); d.setMonth(d.getMonth() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`; };
const daysIn = (iso) => { const d = new Date(iso + 'T12:00:00'); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };

/** Loads every mark of a person (small table — a few hundred rows a year). */
export function useMarks(person, rev) {
  const [marks, setMarks] = useState(null);
  const [targets, setTargets] = useState({});
  const reload = useCallback(async () => {
    if (!person) return;
    const [m, t] = await Promise.all([
      supabase.from('bh_marks').select('id,day,tag,count').eq('person_id', person.id).order('day', { ascending: false }).limit(5000),
      supabase.from('bh_mark_targets').select('tag,target').eq('person_id', person.id),
    ]);
    setMarks(m.data ?? []);
    setTargets(Object.fromEntries((t.data ?? []).map((r) => [r.tag, r.target])));
  }, [person?.id, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setMarks(null); reload(); }, [reload]);
  return { marks, targets, reload };
}

/** Sets a mark's count for a day (0 removes it). */
export async function setMark({ household, person, day, tag, count }) {
  if (count <= 0) return supabase.from('bh_marks').delete().eq('person_id', person.id).eq('day', day).eq('tag', tag);
  return supabase.from('bh_marks').upsert({ household_id: household, person_id: person.id, day, tag, count }, { onConflict: 'person_id,day,tag' });
}

function streak(set) {
  let d = isoDate();
  if (!set.has(d)) d = addDays(d, -1);
  let n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export default function Calendar({ household, person, flash, rev, refresh }) {
  const { marks, targets, reload } = useMarks(person, rev);
  const [month, setMonth] = useState(monthStart(isoDate()));
  const [filter, setFilter] = useState('all');
  const [openDay, setOpenDay] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const today = isoDate();

  const byDay = useMemo(() => {
    const map = {};
    for (const m of marks ?? []) (map[m.day] ??= {})[m.tag] = m.count;
    return map;
  }, [marks]);

  const stats = useMemo(() => {
    const out = {};
    for (const mk of MARKS) {
      const rows = (marks ?? []).filter((m) => m.tag === mk.id);
      const inMonth = rows.filter((m) => m.day.startsWith(month.slice(0, 7)));
      out[mk.id] = {
        total: rows.reduce((s, m) => s + m.count, 0),
        month: inMonth.reduce((s, m) => s + m.count, 0),
        monthDays: inMonth.length,
        streak: streak(new Set(rows.map((m) => m.day))),
      };
    }
    return out;
  }, [marks, month]);

  const cells = useMemo(() => {
    const first = new Date(month + 'T12:00:00').getDay(); // 0 = Sunday
    const n = daysIn(month);
    const arr = Array.from({ length: first }, () => null);
    for (let i = 1; i <= n; i++) arr.push(month.slice(0, 8) + pad(i));
    while (arr.length % 7) arr.push(null);
    return arr;
  }, [month]);

  const saveTarget = async (tag, value) => {
    const v = parseInt(value, 10);
    const { error } = Number.isFinite(v) && v > 0
      ? await supabase.from('bh_mark_targets').upsert({ household_id: household, person_id: person.id, tag, target: v, updated_at: new Date().toISOString() })
      : await supabase.from('bh_mark_targets').delete().eq('person_id', person.id).eq('tag', tag);
    if (error) return flash('ما انحفظ');
    setEditTarget(null); flash('انحفظ ✓'); reload();
  };

  const visible = filter === 'all' ? MARKS : MARKS.filter((m) => m.id === filter);
  const monthName = new Date(month + 'T12:00:00').toLocaleDateString('ar', { month: 'long', year: 'numeric' });
  const hRange = [hijriMonth(month), hijriMonth(month.slice(0, 8) + pad(daysIn(month)))].filter((v, i, a) => v && a.indexOf(v) === i).join(' – ');

  return (
    <div className="stack">
      <div className="mk-summary">
        {MARKS.map((mk) => {
          const s = stats[mk.id];
          const target = targets[mk.id];
          const isQada = mk.id !== 'no_sugar';
          const left = isQada && target ? Math.max(0, target - s.total) : null;
          return (
            <div key={mk.id} className="mk-card" style={{ '--mc': mk.color }}>
              <div className="row between"><span className="mk-ic">{mk.icon}</span><span className="muted small">{mk.label}</span></div>
              {isQada ? (
                <>
                  <b>{s.total}{target ? <small> / {target}</small> : null}</b>
                  {target ? (
                    <>
                      <div className="mk-bar"><span style={{ width: Math.min(100, (s.total / target) * 100) + '%' }} /></div>
                      <small className="muted">{left === 0 ? 'خلصت 🎉' : `باقي ${left} ${mk.counted ? 'صلاة' : 'يوم'}`}</small>
                    </>
                  ) : <small className="muted">{mk.counted ? 'صلاة مقضية' : 'يوم مقضي'}</small>}
                  <button className="mk-link" onClick={() => setEditTarget(mk.id)}>{target ? 'تعديل العدد' : 'كم عليّ؟'}</button>
                </>
              ) : (
                <>
                  <b>{s.monthDays}<small> يوم بالشهر</small></b>
                  <small className="muted">🔥 {s.streak} متتالية · المجموع {s.total}</small>
                </>
              )}
            </div>
          );
        })}
      </div>

      {editTarget && (
        <TargetForm mark={markOf(editTarget)} value={targets[editTarget] ?? ''} onSave={(v) => saveTarget(editTarget, v)} onCancel={() => setEditTarget(null)} />
      )}

      <div className="card">
        <div className="row between">
          <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="الشهر السابق">›</button>
          <button className="plain center" onClick={() => setMonth(monthStart(today))}>
            <h3>{monthName}</h3>
            {hRange && <span className="muted small">{hRange}</span>}
          </button>
          <button className="icon-btn" disabled={month >= monthStart(today)} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="الشهر التالي">‹</button>
        </div>

        <div className="mk-filter">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>الكل</button>
          {MARKS.map((mk) => (
            <button key={mk.id} className={filter === mk.id ? 'on' : ''} style={{ '--mc': mk.color }} onClick={() => setFilter(mk.id)}>{mk.icon} {mk.short}</button>
          ))}
        </div>

        <div className="cal">
          {WEEK.map((w) => <span key={w} className="cal-h">{w}</span>)}
          {cells.map((d, i) => {
            if (!d) return <span key={'e' + i} />;
            const dm = byDay[d] || {};
            const future = d > today;
            const shown = visible.filter((mk) => dm[mk.id]);
            const solo = filter !== 'all' && shown.length ? markOf(filter) : null;
            return (
              <button key={d} disabled={future}
                className={'cal-d' + (d === today ? ' now' : '') + (solo ? ' filled' : '')}
                style={solo ? { '--mc': solo.color } : undefined}
                onClick={() => setOpenDay(d)} aria-label={fmtDate(d)}>
                <span className="cal-n">{Number(d.slice(8))}</span>
                <span className="cal-hj">{hijriDay(d)}</span>
                <span className="cal-dots">
                  {shown.map((mk) => (
                    <i key={mk.id} style={{ background: mk.color }}>{mk.counted && dm[mk.id] > 1 ? dm[mk.id] : ''}</i>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mk-legend">
          {MARKS.map((mk) => <span key={mk.id}><i style={{ background: mk.color }} />{mk.label}</span>)}
        </div>
        <p className="muted small">اكبس على أي يوم لتعلّمه. الرقم الصغير هو التاريخ الهجري (أم القرى، ممكن يختلف يوم).</p>
      </div>

      {openDay && (
        <DaySheet day={openDay} household={household} person={person} current={byDay[openDay] || {}} flash={flash}
          onClose={() => setOpenDay(null)} onChanged={() => { reload(); refresh?.(); }} />
      )}
    </div>
  );
}

function TargetForm({ mark, value, onSave, onCancel }) {
  const [v, setV] = useState(String(value));
  return (
    <form className="card stack" onSubmit={(e) => { e.preventDefault(); onSave(v); }}>
      <h3>{mark.icon} كم {mark.counted ? 'صلاة' : 'يوم'} {mark.label} عليك بالمجموع؟</h3>
      <p className="muted small">التطبيق بيحسب كم قضيت وكم باقي. خلّيه فاضي لإلغاء العدد.</p>
      <div className="row gap">
        <input className="grow" inputMode="numeric" dir="ltr" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus />
        <button className="btn primary">حفظ</button>
        <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}

function DaySheet({ day, household, person, current, flash, onClose, onChanged }) {
  const [vals, setVals] = useState(current);
  const [busy, setBusy] = useState(false);

  const change = async (tag, count) => {
    const prev = vals[tag] || 0;
    setVals((v) => ({ ...v, [tag]: count }));
    setBusy(true);
    const { error } = await setMark({ household, person, day, tag, count });
    setBusy(false);
    if (error) { setVals((v) => ({ ...v, [tag]: prev })); return flash('ما انحفظ'); }
    onChanged();
  };

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="تعليم اليوم">
        <div className="grabber" />
        <div className="row between">
          <div><h3>{fmtDate(day)}</h3><span className="muted small">{hijriMonth(day) && `${hijriDay(day)} ${hijriMonth(day)}`}</span></div>
          <button className="icon-btn" onClick={onClose} aria-label="إغلاق">×</button>
        </div>
        {MARKS.map((mk) => {
          const n = vals[mk.id] || 0;
          return mk.counted ? (
            <div key={mk.id} className="mk-row" style={{ '--mc': mk.color }}>
              <span className="mk-ic">{mk.icon}</span>
              <span className="grow"><b>{mk.label}</b><small className="muted">عدد الصلوات المقضية اليوم</small></span>
              <div className="stepper">
                <button type="button" disabled={busy || n <= 0} onClick={() => change(mk.id, n - 1)} aria-label="أقل">−</button>
                <b>{n}</b>
                <button type="button" disabled={busy || n >= 20} onClick={() => change(mk.id, n + 1)} aria-label="أكثر">+</button>
              </div>
            </div>
          ) : (
            <button key={mk.id} type="button" className={'mk-row toggle' + (n ? ' on' : '')} style={{ '--mc': mk.color }} disabled={busy} onClick={() => change(mk.id, n ? 0 : 1)}>
              <span className="mk-ic">{mk.icon}</span>
              <span className="grow"><b>{mk.label}</b><small className="muted">{mk.id === 'no_sugar' ? 'يوم كامل بدون سكر مضاف أو حلويات' : 'صمت هذا اليوم قضاءً'}</small></span>
              <span className="tick">{n ? '✓' : ''}</span>
            </button>
          );
        })}
        <button className="btn primary" onClick={onClose}>تم</button>
      </div>
    </div>
  );
}

/** Compact card for the home screen: today's toggles + link to the calendar. */
export function TodayMarks({ household, person, flash, rev, go }) {
  const { marks, reload } = useMarks(person, rev);
  const today = isoDate();
  const cur = useMemo(() => Object.fromEntries((marks ?? []).filter((m) => m.day === today).map((m) => [m.tag, m.count])), [marks, today]);
  const sugarStreak = useMemo(() => streak(new Set((marks ?? []).filter((m) => m.tag === 'no_sugar').map((m) => m.day))), [marks]);
  const toggle = async (mk) => {
    const n = cur[mk.id] || 0;
    const next = mk.counted ? (n >= 5 ? 0 : n + 1) : (n ? 0 : 1);
    const { error } = await setMark({ household, person, day: today, tag: mk.id, count: next });
    if (error) return flash('ما انحفظ');
    reload();
  };
  return (
    <div className="card">
      <div className="row between">
        <h3>📅 تقويم اليوم</h3>
        <button className="btn ghost sm" onClick={() => go('cal')}>التقويم</button>
      </div>
      <div className="mk-quick">
        {MARKS.map((mk) => {
          const n = cur[mk.id] || 0;
          return (
            <button key={mk.id} className={n ? 'on' : ''} style={{ '--mc': mk.color }} onClick={() => toggle(mk)}>
              <span>{mk.icon}</span>
              <small>{mk.label}{mk.counted && n ? ` (${n})` : ''}</small>
            </button>
          );
        })}
      </div>
      {sugarStreak > 0 && <p className="muted small" style={{ marginTop: 8 }}>🔥 {sugarStreak} {sugarStreak === 1 ? 'يوم' : 'أيام'} متتالية بدون سكر</p>}
    </div>
  );
}
