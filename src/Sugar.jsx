import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';
import { addDays, fmtDate, fmtShort, isoDate, pad } from './lib.js';

const WEEK = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];
const GOALS = [7, 21, 30, 40, 90];
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86400000);
const monthStart = (iso) => iso.slice(0, 8) + '01';
const shiftMonth = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(1); d.setMonth(d.getMonth() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`; };
const daysIn = (iso) => { const d = new Date(iso + 'T12:00:00'); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
const daysWord = (n) => (n === 1 ? 'يوم' : n === 2 ? 'يومين' : n >= 3 && n <= 10 ? 'أيام' : 'يوم');

/** Loads the person's counter settings and slip days, and computes the numbers. */
export function useSugar(person, rev) {
  const [cfg, setCfg] = useState(undefined);
  const [slips, setSlips] = useState([]);
  const reload = useCallback(async () => {
    if (!person) return;
    const [c, s] = await Promise.all([
      supabase.from('bh_sugar').select('start_on,goal_days').eq('person_id', person.id).maybeSingle(),
      supabase.from('bh_sugar_slips').select('day').eq('person_id', person.id).order('day').limit(5000),
    ]);
    setCfg(c.data ?? null);
    setSlips((s.data ?? []).map((r) => r.day));
  }, [person?.id, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setCfg(undefined); reload(); }, [reload]);

  const stats = useMemo(() => {
    if (!cfg) return null;
    const today = isoDate();
    const start = cfg.start_on;
    const slipSet = new Set(slips.filter((d) => d >= start && d <= today));
    const span = Math.max(0, dayDiff(start, today) + 1);
    const lastSlip = [...slipSet].sort().pop();
    // Current run: from the day after the last slip (or the start) up to today, inclusive.
    const runFrom = lastSlip ? addDays(lastSlip, 1) : start;
    const current = Math.max(0, dayDiff(runFrom, today) + 1);
    let best = 0, run = 0;
    for (let i = 0; i < span; i++) {
      const d = addDays(start, i);
      if (slipSet.has(d)) run = 0; else best = Math.max(best, ++run);
    }
    return { start, current, best, clean: span - slipSet.size, slips: slipSet.size, span, slipSet, sliptoday: slipSet.has(today), goal: cfg.goal_days };
  }, [cfg, slips]);

  return { cfg, stats, reload };
}

async function setSlip(household, person, day, on) {
  return on
    ? supabase.from('bh_sugar_slips').upsert({ household_id: household, person_id: person.id, day }, { onConflict: 'person_id,day' })
    : supabase.from('bh_sugar_slips').delete().eq('person_id', person.id).eq('day', day);
}

function BigRing({ value, children, color }) {
  const size = 190, stroke = 14, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="sg-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .7s' }} />
      </svg>
      <div className="sg-ring-in">{children}</div>
    </div>
  );
}

export default function Sugar({ household, person, flash, rev, refresh }) {
  const { cfg, stats, reload } = useSugar(person, rev);
  const [month, setMonth] = useState(monthStart(isoDate()));
  const [settings, setSettings] = useState(false);
  const today = isoDate();
  const color = person.color || '#0f766e';

  const saveCfg = async (start_on, goal_days) => {
    const { error } = await supabase.from('bh_sugar').upsert({ person_id: person.id, household_id: household, start_on, goal_days: goal_days || null, updated_at: new Date().toISOString() });
    if (error) return flash('ما انحفظ');
    setSettings(false); flash('انحفظ ✓'); reload(); refresh?.();
  };

  const toggleSlip = async (day, on) => {
    const { error } = await setSlip(household, person, day, on);
    if (error) return flash('ما انحفظ');
    flash(on ? 'ولا يهمك، بكرا يوم جديد 💪' : 'تم ✓');
    reload(); refresh?.();
  };

  if (cfg === undefined) return <p className="muted center">...</p>;
  if (!cfg || settings) return <Setup cfg={cfg} onSave={saveCfg} onCancel={cfg ? () => setSettings(false) : null} />;

  const s = stats;
  const goal = s.goal;
  const nextGoal = goal || GOALS.find((g) => g > s.current) || Math.ceil((s.current + 1) / 30) * 30;
  const cells = (() => {
    const first = new Date(month + 'T12:00:00').getDay();
    const arr = Array.from({ length: first }, () => null);
    for (let i = 1; i <= daysIn(month); i++) arr.push(month.slice(0, 8) + pad(i));
    while (arr.length % 7) arr.push(null);
    return arr;
  })();
  const monthName = new Date(month + 'T12:00:00').toLocaleDateString('ar', { month: 'long', year: 'numeric' });

  return (
    <div className="stack">
      <section className="card sg-hero">
        <BigRing value={s.current / nextGoal} color={color}>
          <b>{s.current}</b>
          <span>{daysWord(s.current)} بدون سكر</span>
        </BigRing>
        <p className="sg-since">من {fmtDate(s.current && !s.sliptoday ? addDays(today, 1 - s.current) : today)}</p>
        <p className="muted small">
          {goal
            ? s.current >= goal ? `🎉 وصلت لهدفك: ${goal} يوم!` : `باقي ${goal - s.current} ${daysWord(goal - s.current)} للهدف (${goal})`
            : `الهدف الجاي: ${nextGoal} يوم`}
        </p>
        {s.sliptoday ? (
          <button className="btn ghost" onClick={() => toggleSlip(today, false)}>↩︎ ما أكلت سكر اليوم (تراجع)</button>
        ) : (
          <button className="btn sg-slip" onClick={() => { if (confirm('أكلت سكر اليوم؟ العداد بيرجع يبدأ من بكرا.')) toggleSlip(today, true); }}>🍬 أكلت سكر اليوم</button>
        )}
      </section>

      <div className="card">
        <h3>المحطات</h3>
        <div className="sg-miles">
          {GOALS.map((g) => {
            const done = s.best >= g, now = !done && s.current < g && g === GOALS.find((x) => x > s.current);
            return (
              <div key={g} className={'sg-mile' + (done ? ' done' : '') + (now ? ' now' : '')} style={{ '--mc': color }}>
                <span>{done ? '🏅' : now ? '🎯' : '🔒'}</span>
                <b>{g}</b><small>يوم</small>
                {now && <i style={{ width: (s.current / g) * 100 + '%' }} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="stats3">
        <div className="stat-mini"><span>🏆</span><b>{s.best}</b><small>أطول فترة</small></div>
        <div className="stat-mini"><span>✅</span><b>{s.clean}</b><small>يوم نظيف من {s.span}</small></div>
        <div className="stat-mini"><span>🍬</span><b>{s.slips}</b><small>مرات سكر</small></div>
      </div>

      <div className="card">
        <div className="row between">
          <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="الشهر السابق">›</button>
          <button className="plain" onClick={() => setMonth(monthStart(today))}><h3>{monthName}</h3></button>
          <button className="icon-btn" disabled={month >= monthStart(today)} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="الشهر التالي">‹</button>
        </div>
        <div className="cal" style={{ marginTop: 10, '--mc': color }}>
          {WEEK.map((w) => <span key={w} className="cal-h">{w}</span>)}
          {cells.map((d, i) => {
            if (!d) return <span key={'e' + i} />;
            const before = d < s.start, future = d > today;
            const slip = s.slipSet.has(d);
            const cls = before || future ? '' : slip ? ' slip' : ' clean';
            return (
              <button key={d} className={'cal-d' + cls + (d === today ? ' now' : '')} disabled={before || future}
                onClick={() => { if (confirm(slip ? `${fmtDate(d)}: شيل علامة السكر؟` : `${fmtDate(d)}: أكلت سكر بهذا اليوم؟`)) toggleSlip(d, !slip); }}
                aria-label={fmtDate(d)}>
                <span className="cal-n">{Number(d.slice(8))}</span>
                <span className="cal-st">{before || future ? '' : slip ? '🍬' : '✓'}</span>
              </button>
            );
          })}
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>✓ يوم بدون سكر · 🍬 يوم فيه سكر. اكبس على يوم لتصحيحه.</p>
      </div>

      <div className="card row between">
        <span className="muted small">بدأت {fmtShort(s.start)}{goal ? ` · الهدف ${goal} يوم` : ''}</span>
        <button className="btn ghost sm" onClick={() => setSettings(true)}>الإعدادات</button>
      </div>
    </div>
  );
}

function Setup({ cfg, onSave, onCancel }) {
  const [start, setStart] = useState(cfg?.start_on || isoDate());
  const [goal, setGoal] = useState(cfg?.goal_days ? String(cfg.goal_days) : '30');
  return (
    <form className="card stack" onSubmit={(e) => { e.preventDefault(); onSave(start, parseInt(goal, 10) || null); }}>
      <div className="center" style={{ fontSize: '2.4rem' }}>🚫🍬</div>
      <h3 className="center">{cfg ? 'إعدادات العداد' : 'عداد أيام بدون سكر'}</h3>
      <p className="muted small center">العداد بيحسب كل يوم لحاله. بس إذا أكلت سكر، اكبس «أكلت سكر اليوم» وبيرجع يبدأ من جديد.</p>
      <label>بلشت من تاريخ<input type="date" value={start} max={isoDate()} onChange={(e) => setStart(e.target.value)} /></label>
      <div>
        <span className="small">الهدف</span>
        <div className="sg-goals">
          {GOALS.map((g) => <button type="button" key={g} className={goal === String(g) ? 'on' : ''} onClick={() => setGoal(String(g))}>{g} يوم</button>)}
          <button type="button" className={goal === '' ? 'on' : ''} onClick={() => setGoal('')}>بدون</button>
        </div>
      </div>
      <button className="btn primary">{cfg ? 'حفظ' : 'ابدأ العداد'}</button>
      {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>}
    </form>
  );
}

/** Home screen card. */
export function SugarCard({ household, person, flash, rev, refresh, go }) {
  const { cfg, stats, reload } = useSugar(person, rev);
  if (cfg === undefined) return null;
  if (!cfg) {
    return (
      <button className="card cta" onClick={() => go('sugar')}>
        <span className="cta-ic">🚫🍬</span>
        <span className="grow"><b>عداد أيام بدون سكر</b><small className="muted">ابدأ العداد وشوف كم يوم بتقدر تكمّل.</small></span>
        <span className="muted">‹</span>
      </button>
    );
  }
  const slip = async () => {
    if (!confirm('أكلت سكر اليوم؟ العداد بيرجع يبدأ من بكرا.')) return;
    const { error } = await setSlip(household, person, isoDate(), true);
    if (error) return flash('ما انحفظ');
    flash('ولا يهمك، بكرا يوم جديد 💪'); reload(); refresh?.();
  };
  return (
    <div className="card sg-card">
      <button className="plain sg-card-main" onClick={() => go('sugar')}>
        <span className="sg-num">{stats.current}</span>
        <span className="grow"><b>{daysWord(stats.current)} بدون سكر</b><small className="muted">🏆 أطول فترة {stats.best}{stats.goal ? ` · الهدف ${stats.goal}` : ''}</small></span>
      </button>
      {!stats.sliptoday && <button className="btn ghost sm" onClick={slip}>🍬 أكلت</button>}
    </div>
  );
}
