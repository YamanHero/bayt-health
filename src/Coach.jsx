import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';
import { SLOTS, slotLabel } from './data.js';
import { coach, fmtShort, fmtWeekday, isMinor, isoDate, addDays } from './lib.js';

const SEGS = [
  { id: 'week', label: 'خطة الأسبوع' },
  { id: 'today', label: 'قائمة اليوم' },
  { id: 'ask', label: 'اسأل' },
  { id: 'review', label: 'مراجعة' },
];
const slotIcon = (id) => SLOTS.find((s) => s.id === id)?.icon ?? '';

export default function Coach({ household, person, flash, userId, onSaved }) {
  const [seg, setSeg] = useState('week');
  return (
    <div className="stack">
      <div className="seg seg4">
        {SEGS.map((s) => <button key={s.id} className={seg === s.id ? 'on' : ''} onClick={() => setSeg(s.id)}>{s.label}</button>)}
      </div>
      {seg === 'week' && <WeekPlan household={household} person={person} flash={flash} userId={userId} onSaved={onSaved} />}
      {seg === 'today' && <DayPlan household={household} person={person} flash={flash} onSaved={onSaved} />}
      {seg === 'ask' && <Ask person={person} flash={flash} />}
      {seg === 'review' && <Review person={person} flash={flash} />}
      <p className="muted small center">اقتراحات عامة، مش بديل عن طبيب أو أخصائي تغذية.</p>
    </div>
  );
}

/* ---------- weekly family plan + shopping list ---------- */
function WeekPlan({ household, person, flash, userId, onSaved }) {
  const [plan, setPlan] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(isoDate());
  const [showShop, setShowShop] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('bh_plans').select('*').eq('household_id', household).order('created_at', { ascending: false }).limit(1);
    setPlan(data?.[0] ?? null);
  }, [household]);
  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    if (plan && !confirm('بدك خطة جديدة بدل الحالية؟')) return;
    setBusy(true);
    const weekStart = isoDate();
    const { result, error } = await coach({ mode: 'week_plan', person_id: person.id, week_start: weekStart });
    if (error) { setBusy(false); return flash(error); }
    const { data, error: e2 } = await supabase.from('bh_plans').insert({ household_id: household, person_id: person.id, week_start: weekStart, plan: result }).select().single();
    setBusy(false);
    if (e2) return flash('ما انحفظت الخطة');
    setPlan(data); setOpen(isoDate()); flash('الخطة جاهزة ✓');
  };

  const exportList = async () => {
    const items = plan?.plan?.shopping ?? [];
    if (!items.length) return;
    setExporting(true);
    const { data: list, error } = await supabase.from('shopping_lists').insert({
      household_id: household, name: `مشتريات بيت الصحة · ${fmtShort(plan.week_start)}`, type: 'weekly', week_start: plan.week_start, status: 'active', created_by: userId,
    }).select().single();
    if (error) { setExporting(false); return flash('ما قدرنا نعمل القائمة في «بيتنا»'); }
    const { error: e2 } = await supabase.from('shopping_items').insert(items.map((x) => ({
      shopping_list_id: list.id, household_id: household, name: String(x.name).slice(0, 120),
      quantity: x.quantity > 0 ? x.quantity : 1, unit: x.unit || null, category: x.category || 'أخرى',
    })));
    if (e2) { await supabase.from('shopping_lists').delete().eq('id', list.id); setExporting(false); return flash('ما انحفظت الأغراض'); }
    await supabase.from('bh_plans').update({ exported_list_id: list.id }).eq('id', plan.id);
    setExporting(false); setPlan({ ...plan, exported_list_id: list.id });
    flash('انبعتت القائمة لـ «بيتنا» ✓');
  };

  const logMeal = async (m) => {
    const { error } = await supabase.from('bh_meals').insert({ household_id: household, person_id: person.id, eaten_on: isoDate(), slot: m.slot, description: m.title + (m.note ? ` (${m.note})` : ''), source: 'plan' });
    if (error) return flash('ما انحفظ');
    flash(`انسجلت لـ ${person.name} ✓`); onSaved?.();
  };

  const shopping = useMemo(() => {
    const g = {};
    for (const x of plan?.plan?.shopping ?? []) (g[x.category || 'أخرى'] ||= []).push(x);
    return Object.entries(g);
  }, [plan]);

  if (plan === undefined) return <div className="card"><p className="muted">...</p></div>;

  const stale = plan && plan.week_start < addDays(isoDate(), -6);

  if (!plan || busy) {
    return (
      <div className="card hero-empty">
        <div className="big-emoji">🗓️</div>
        <h3>خطة أكل للعيلة كلها لأسبوع</h3>
        <p className="muted">7 أيام من الطبخ البيتي، بتراعي قيود كل واحد، ومعها قائمة مشتريات بتنبعت لـ «بيتنا» بكبسة.</p>
        <button className="btn primary" disabled={busy} onClick={generate}>{busy ? 'المدرب بيحضّر الخطة... (دقيقة تقريباً)' : '✨ اعمل خطة الأسبوع'}</button>
        {busy && <div className="loader" aria-hidden="true"><span /></div>}
      </div>
    );
  }

  const p = plan.plan;
  return (
    <div className="stack">
      <div className="card">
        <div className="row between"><h3>خطة من {fmtShort(plan.week_start)}</h3><button className="btn ghost sm" onClick={generate}>خطة جديدة</button></div>
        {stale && <p className="note small">هالخطة قديمة. اعمل خطة جديدة للأسبوع.</p>}
        {p.intro && <p className="muted small" style={{ marginTop: 6 }}>{p.intro}</p>}
      </div>

      {(p.days ?? []).map((d) => {
        const isToday = d.date === isoDate();
        const isOpen = open === d.date;
        return (
          <div key={d.date} className={'card day' + (isToday ? ' today' : '')}>
            <button className="row between full plain" onClick={() => setOpen(isOpen ? '' : d.date)}>
              <span><b>{fmtWeekday(d.date)}</b> <span className="muted small">{fmtShort(d.date)}</span>{isToday && <span className="pill good">اليوم</span>}</span>
              <span className="muted">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <ul className="list rows">
                {d.meals.map((m, i) => (
                  <li key={i}>
                    <span className="grow"><span className="slot-ic">{slotIcon(m.slot)}</span> <b>{slotLabel(m.slot)}:</b> {m.title}{m.note ? <span className="muted small"> · {m.note}</span> : null}</span>
                    {isToday && <button className="btn ghost sm" onClick={() => logMeal(m)}>أكلتها</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      <div className="card">
        <button className="row between full plain" onClick={() => setShowShop((v) => !v)}>
          <h3>🛒 قائمة المشتريات ({p.shopping?.length ?? 0})</h3><span className="muted">{showShop ? '▲' : '▼'}</span>
        </button>
        {showShop && shopping.map(([cat, list]) => (
          <div key={cat} className="slot">
            <h4>{cat}</h4>
            <ul className="list rows">
              {list.map((x, i) => <li key={i}><span className="grow">{x.name}</span><span className="muted">{Number(x.quantity).toLocaleString('ar')} {x.unit}</span></li>)}
            </ul>
          </div>
        ))}
        <button className="btn primary full" style={{ marginTop: 10 }} disabled={exporting || !!plan.exported_list_id} onClick={exportList}>
          {plan.exported_list_id ? '✓ انبعتت لقائمة مشتريات «بيتنا»' : exporting ? '...' : 'ابعت القائمة لـ «بيتنا»'}
        </button>
      </div>

      {p.prep_tips?.length > 0 && (
        <div className="card">
          <h3>💡 نصائح تحضير</h3>
          <ul className="tips">{p.prep_tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

/* ---------- today menu for one member ---------- */
function DayPlan({ household, person, flash, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const minor = isMinor(person);
  useEffect(() => { setRes(null); }, [person.id]);
  const run = async () => {
    setBusy(true); setRes(null);
    const { result, error } = await coach({ mode: 'plan', person_id: person.id });
    setBusy(false);
    if (error) return flash(error);
    setRes(result);
  };
  const logMeal = async (m) => {
    const { error } = await supabase.from('bh_meals').insert({ household_id: household, person_id: person.id, eaten_on: isoDate(), slot: m.slot, description: `${m.title} — ${m.items}`, kcal: minor ? null : m.kcal || null, source: 'ai' });
    if (error) return flash('ما انحفظ');
    flash('انسجلت ✓'); onSaved?.();
  };
  return (
    <div className="stack">
      <div className="card">
        <p className="muted small">بيقرا سجل {person.name} وبيقترح قائمة تناسبه اليوم. {person.restrictions ? `القيود: ${person.restrictions}.` : ''}</p>
        <button className="btn primary full" style={{ marginTop: 10 }} disabled={busy} onClick={run}>{busy ? 'لحظة...' : '✨ اقترح قائمة لليوم'}</button>
      </div>
      {res && (
        <div className="card stack">
          <p>{res.intro}</p>
          {(res.meals ?? []).map((m, i) => (
            <div key={i} className="menu-item">
              <div className="grow"><b>{slotIcon(m.slot)} {slotLabel(m.slot)}: {m.title}</b><p className="muted small">{m.items}{!minor && m.kcal ? ` · ~${m.kcal}` : ''}</p></div>
              <button className="btn ghost sm" onClick={() => logMeal(m)}>سجّل</button>
            </div>
          ))}
          {res.activity && <p className="tipbox">🏃 {res.activity}</p>}
        </div>
      )}
    </div>
  );
}

function Ask({ person, flash }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const run = async (e) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true); setAnswer('');
    const { result, error } = await coach({ mode: 'ask', person_id: person.id, question: q.trim() });
    setBusy(false);
    if (error) return flash(error);
    setAnswer(result.answer);
  };
  return (
    <div className="stack">
      <form className="card stack" onSubmit={run}>
        <label>اسأل المدرب عن {person.name}<textarea rows="3" placeholder="مثلاً: شو بديل صحي للحلو بعد الغدا؟" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button className="btn primary" disabled={busy}>{busy ? 'لحظة...' : 'اسأل'}</button>
      </form>
      {answer && <div className="card"><p className="pre">{answer}</p></div>}
    </div>
  );
}

function Review({ person, flash }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  useEffect(() => { setRes(null); }, [person.id]);
  const run = async () => {
    setBusy(true); setRes(null);
    const { result, error } = await coach({ mode: 'week', person_id: person.id });
    setBusy(false);
    if (error) return flash(error);
    setRes(result);
  };
  return (
    <div className="stack">
      <div className="card">
        <p className="muted small">مراجعة لآخر أسبوعين من سجل {person.name}: شو ماشي منيح وشو ممكن يتحسّن.</p>
        <button className="btn primary full" style={{ marginTop: 10 }} disabled={busy} onClick={run}>{busy ? 'لحظة...' : 'راجع أسبوعي'}</button>
      </div>
      {res && (
        <div className="card stack">
          <h3>{res.headline}</h3>
          {(res.points ?? []).map((p, i) => <div key={i} className={'point ' + p.kind}><b>{p.title}</b><p>{p.text}</p></div>)}
        </div>
      )}
    </div>
  );
}
