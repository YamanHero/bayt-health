import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';
import { SLOTS, slotLabel, KINDS, kindOf, ACTIVITY, COLORS, MENUS } from './data.js';
import { addDays, ageOf, fmtDate, fmtKg, fmtShort, isMinor, isoDate, lsGet, lsSet, streakOf } from './lib.js';
import { currentSubscription, pushState } from './push.js';
import QuickAdd from './QuickAdd.jsx';
import Coach from './Coach.jsx';
import Reminders from './Reminders.jsx';

const TABS = [
  { id: 'home', label: 'اليوم', icon: '🏠' },
  { id: 'weight', label: 'الوزن', icon: '⚖️' },
  { id: 'food', label: 'الأكل', icon: '🥗' },
  { id: 'sport', label: 'الحركة', icon: '🏃' },
  { id: 'coach', label: 'المدرب', icon: '✨' },
];
const slotIcon = (id) => SLOTS.find((s) => s.id === id)?.icon ?? '';

/* ---------- root ---------- */
export default function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <Splash />;
  if (!session) return <Login />;
  return <Shell session={session} />;
}

function Splash() {
  return <div className="splash"><img src="/icon.svg" alt="" width="64" height="64" /><p>بيت الصحة</p></div>;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMsg('البريد أو كلمة السر غير صحيحة.');
  };
  return (
    <div className="login">
      <img src="/icon.svg" alt="" width="72" height="72" />
      <h1>بيت الصحة</h1>
      <p className="muted">متابعة الأكل والوزن والحركة للعيلة. ادخل بنفس حساب «بيتنا».</p>
      <form onSubmit={submit} className="card stack">
        <label>البريد الإلكتروني<input type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>كلمة السر<input type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button className="btn primary" disabled={busy}>{busy ? '...' : 'دخول'}</button>
        {msg && <p className="note">{msg}</p>}
      </form>
    </div>
  );
}

function Shell({ session }) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [household, setHousehold] = useState(undefined);
  const [people, setPeople] = useState([]);
  const [personId, setPersonId] = useState(lsGet('bh.person'));
  const [tab, setTab] = useState(params.get('tab') || lsGet('bh.tab') || 'home');
  const [sheet, setSheet] = useState(params.get('add') ? { kind: 'add', mode: params.get('add') } : null);
  const [toast, setToast] = useState('');
  const [rev, setRev] = useState(0);

  const flash = useCallback((t) => { setToast(t); setTimeout(() => setToast(''), 2400); }, []);
  const refresh = useCallback(() => setRev((n) => n + 1), []);

  useEffect(() => { if (params.toString()) window.history.replaceState(null, '', '/'); }, [params]);
  useEffect(() => {
    supabase.from('household_members').select('household_id').eq('user_id', session.user.id).limit(1)
      .then(({ data }) => setHousehold(data?.[0]?.household_id ?? null));
  }, [session.user.id]);

  const loadPeople = useCallback(async () => {
    if (!household) return;
    const { data } = await supabase.from('bh_people').select('*').eq('household_id', household).order('created_at');
    setPeople(data ?? []);
  }, [household]);
  useEffect(() => { loadPeople(); }, [loadPeople]);

  const person = people.find((p) => p.id === personId) ?? people[0];
  useEffect(() => { if (person) lsSet('bh.person', person.id); }, [person]);
  useEffect(() => { lsSet('bh.tab', tab); window.scrollTo(0, 0); }, [tab]);

  if (household === undefined) return <Splash />;
  if (household === null) {
    return (
      <div className="login">
        <h1>بيت الصحة</h1>
        <p className="muted">حسابك مش مربوط ببيت في «بيتنا». افتح «بيتنا» أولاً أو اطلب من صاحب البيت يضيفك.</p>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>خروج</button>
      </div>
    );
  }

  const ctx = { household, person, people, flash, rev, refresh };
  const openAdd = (mode = 'meal') => setSheet({ kind: 'add', mode });

  return (
    <div className="app" style={{ '--pc': person?.color || '#0f766e' }}>
      <header className="top">
        <div className="brand"><img src="/icon.svg" alt="" width="28" height="28" /><span>بيت الصحة</span></div>
        <div className="row gap6">
          <button className="icon-btn" onClick={() => setSheet({ kind: 'remind' })} aria-label="التذكيرات">🔔</button>
          <button className="icon-btn" onClick={() => setSheet({ kind: 'people' })} aria-label="أفراد العيلة">👨‍👩‍👧‍👦</button>
        </div>
      </header>

      <nav className="people-bar" aria-label="اختيار الفرد">
        {people.map((p) => (
          <button key={p.id} className={'chip' + (p.id === person?.id ? ' on' : '')} style={{ '--c': p.color }} onClick={() => setPersonId(p.id)}>
            <span className="avatar">{p.name.slice(0, 1)}</span>{p.name}
          </button>
        ))}
        <button className="chip add" onClick={() => setSheet({ kind: 'people', create: true })}>+ فرد</button>
      </nav>

      <main className="content">
        {!person ? (
          <div className="card empty">
            <p>ابدأ بإضافة أفراد العيلة.</p>
            <button className="btn primary" onClick={() => setSheet({ kind: 'people', create: true })}>إضافة فرد</button>
          </div>
        ) : (
          <>
            {tab === 'home' && <Home {...ctx} go={setTab} openAdd={openAdd} openRemind={() => setSheet({ kind: 'remind' })} />}
            {tab === 'weight' && <Weight {...ctx} />}
            {tab === 'food' && <Food {...ctx} openAdd={openAdd} />}
            {tab === 'sport' && <Sport {...ctx} />}
            {tab === 'coach' && <Coach {...ctx} userId={session.user.id} onSaved={refresh} />}
          </>
        )}
      </main>

      {person && <button className="fab" onClick={() => openAdd(tab === 'weight' ? 'weight' : tab === 'sport' ? 'move' : 'meal')} aria-label="تسجيل سريع">+</button>}

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span className="ti">{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </nav>

      {sheet?.kind === 'add' && person && (
        <QuickAdd household={household} person={person} initial={sheet.mode} flash={flash} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); refresh(); }} />
      )}
      {sheet?.kind === 'remind' && <Reminders household={household} people={people} person={person} flash={flash} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'people' && (
        <PeopleSheet household={household} people={people} startNew={sheet.create} onClose={() => setSheet(null)}
          onChanged={async (id) => { await loadPeople(); if (id) setPersonId(id); }} flash={flash} />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

/* ---------- data hook ---------- */
function useRows(table, person, dateCol, days, rev) {
  const [rows, setRows] = useState(null);
  const reload = useCallback(async () => {
    if (!person) return;
    let q = supabase.from(table).select('*').eq('person_id', person.id).order(dateCol, { ascending: false }).order('created_at', { ascending: false });
    if (days) q = q.gte(dateCol, addDays(isoDate(), -days));
    const { data } = await q.limit(500);
    setRows(data ?? []);
  }, [table, person?.id, dateCol, days, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { setRows(null); }, [person?.id]);
  return [rows, reload];
}

/* ---------- Home ---------- */
function Ring({ value, size = 92, stroke = 9, children }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fff" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .6s' }} />
      </svg>
      <div className="ring-in">{children}</div>
    </div>
  );
}

function Home({ household, person, go, openAdd, openRemind, rev, refresh, flash }) {
  const [weights] = useRows('bh_weights', person, 'measured_on', null, rev);
  const [meals] = useRows('bh_meals', person, 'eaten_on', 40, rev);
  const [workouts] = useRows('bh_workouts', person, 'done_on', 40, rev);
  const [plan, setPlan] = useState(null);
  const [remindOn, setRemindOn] = useState(true);
  const minor = isMinor(person);
  const today = isoDate();

  useEffect(() => {
    supabase.from('bh_plans').select('week_start,plan').eq('household_id', household).order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => setPlan(data?.[0] ?? null));
  }, [household, rev]);
  useEffect(() => {
    const st = pushState();
    if (st === 'unsupported') { setRemindOn(true); return; }
    currentSubscription().then((s) => setRemindOn(!!s)).catch(() => setRemindOn(true));
  }, []);

  const last = weights?.[0];
  const first = weights?.length ? weights[weights.length - 1] : null;
  const todayMeals = (meals ?? []).filter((m) => m.eaten_on === today);
  const todayMove = (workouts ?? []).filter((w) => w.done_on === today).reduce((s, w) => s + w.minutes, 0);
  const weekMin = (workouts ?? []).filter((w) => w.done_on >= addDays(today, -6)).reduce((s, w) => s + w.minutes, 0);
  const moveTarget = minor ? 60 : 30;
  const kcal = todayMeals.reduce((s, m) => s + (m.kcal || 0), 0);
  const protein = todayMeals.reduce((s, m) => s + (m.protein_g || 0), 0);
  const streak = streakOf([...(meals ?? []).map((m) => m.eaten_on), ...(workouts ?? []).map((w) => w.done_on), ...(weights ?? []).map((w) => w.measured_on)]);

  let progress = null;
  if (!minor && last && first && person.goal_kg) {
    const total = first.kg - person.goal_kg;
    progress = total > 0 ? (first.kg - last.kg) / total : last.kg <= person.goal_kg ? 1 : 0;
  }
  const toGoal = !minor && last && person.goal_kg ? last.kg - person.goal_kg : null;
  const slotsDone = new Set(todayMeals.map((m) => m.slot));
  const checklist = [
    ...(!minor ? [{ key: 'w', label: 'وزن اليوم', done: last?.measured_on === today, act: () => openAdd('weight') }] : []),
    { key: 'b', label: 'الفطور', done: slotsDone.has('breakfast'), act: () => openAdd('meal') },
    { key: 'l', label: 'الغدا', done: slotsDone.has('lunch'), act: () => openAdd('meal') },
    { key: 'd', label: 'العشا', done: slotsDone.has('dinner'), act: () => openAdd('meal') },
    { key: 'm', label: `${moveTarget} دقيقة حركة`, done: todayMove >= moveTarget, sub: todayMove ? `${todayMove} د` : '', act: () => openAdd('move') },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const todayPlan = plan?.plan?.days?.find((d) => d.date === today);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'صباح الخير' : hour < 18 ? 'نهارك سعيد' : 'مسا الخير';

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero-text">
          <p className="hero-hi">{hello}</p>
          <h2>{person.name}</h2>
          <p className="hero-sub">{new Date().toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <div className="hero-badges">
            <span className="hb">🔥 {streak} {streak === 1 ? 'يوم' : 'أيام'} متتالية</span>
            <span className="hb">✓ {doneCount}/{checklist.length} اليوم</span>
          </div>
        </div>
        {progress != null ? (
          <Ring value={progress}><b>{toGoal <= 0 ? '🎉' : fmtKg(toGoal)}</b><small>{toGoal <= 0 ? 'وصلت' : 'كغ للهدف'}</small></Ring>
        ) : (
          <Ring value={doneCount / checklist.length}><b>{Math.round((doneCount / checklist.length) * 100)}%</b><small>اليوم</small></Ring>
        )}
      </section>

      <div className="stats3">
        <button className="stat-mini" onClick={() => go('weight')}><span>⚖️</span><b>{fmtKg(last?.kg)}</b><small>{last ? fmtShort(last.measured_on) : 'كغ'}</small></button>
        <button className="stat-mini" onClick={() => go('sport')}><span>🚶</span><b>{weekMin}</b><small>دقيقة/أسبوع</small></button>
        {minor ? (
          <button className="stat-mini" onClick={() => go('food')}><span>🍽️</span><b>{todayMeals.length}</b><small>وجبات اليوم</small></button>
        ) : (
          <button className="stat-mini" onClick={() => go('food')}><span>🍽️</span><b>{kcal ? `~${kcal}` : todayMeals.length}</b><small>{kcal ? `سعرة${protein ? ` · ${protein}غ بروتين` : ''}` : 'وجبات اليوم'}</small></button>
        )}
      </div>

      <div className="card">
        <div className="row between"><h3>مهام اليوم</h3><span className="muted small">اكبس للتسجيل</span></div>
        <ul className="checklist">
          {checklist.map((c) => (
            <li key={c.key}>
              <button className={c.done ? 'done' : ''} onClick={c.act}>
                <span className="tick">{c.done ? '✓' : ''}</span>
                <span className="grow">{c.label}</span>
                {c.sub && <span className="muted small">{c.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {todayPlan ? (
        <div className="card">
          <div className="row between"><h3>🗓️ أكل اليوم من خطة الأسبوع</h3><button className="btn ghost sm" onClick={() => go('coach')}>الخطة</button></div>
          <ul className="list">
            {todayPlan.meals.map((m, i) => <li key={i}>{slotIcon(m.slot)} <b>{slotLabel(m.slot)}:</b> {m.title}</li>)}
          </ul>
        </div>
      ) : (
        <button className="card cta" onClick={() => go('coach')}>
          <span className="cta-ic">🗓️</span>
          <span className="grow"><b>خطة أكل للأسبوع + قائمة مشتريات</b><small className="muted">المدرب بيحضّرها للعيلة كلها، وبتنبعت لـ «بيتنا».</small></span>
          <span className="muted">‹</span>
        </button>
      )}

      {!remindOn && (
        <button className="card cta" onClick={openRemind}>
          <span className="cta-ic">🔔</span>
          <span className="grow"><b>فعّل التذكيرات اليومية</b><small className="muted">تذكير بالوزن والأكل والحركة، بس إذا لسا ما سجّلت.</small></span>
          <span className="muted">‹</span>
        </button>
      )}

      {todayMeals.length > 0 && (
        <div className="card">
          <h3>سجل أكل اليوم</h3>
          <ul className="list">
            {todayMeals.map((m) => <li key={m.id}>{slotIcon(m.slot)} <b>{slotLabel(m.slot)}</b> · {m.description}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- Weight ---------- */
function Weight({ household, person, flash, rev, refresh }) {
  const [rows, reload] = useRows('bh_weights', person, 'measured_on', null, rev);
  const [kg, setKg] = useState('');
  const [date, setDate] = useState(isoDate());
  const minor = isMinor(person);

  const add = async (e) => {
    e.preventDefault();
    const v = parseFloat(String(kg).replace(',', '.'));
    if (!(v > 10 && v < 400)) return flash('رقم الوزن مش منطقي');
    const { error } = await supabase.from('bh_weights').insert({ household_id: household, person_id: person.id, kg: v, measured_on: date });
    if (error) return flash('ما انحفظ، جرّب مرة ثانية');
    setKg(''); flash('انحفظ ✓'); refresh();
  };
  const del = async (id) => { if (!confirm('حذف القياس؟')) return; await supabase.from('bh_weights').delete().eq('id', id); reload(); };

  const pts = useMemo(() => [...(rows ?? [])].reverse().slice(-60), [rows]);
  const first = pts[0], last = pts[pts.length - 1];
  const wk = useMemo(() => {
    if (!rows?.length) return null;
    const older = rows.find((r) => r.measured_on <= addDays(isoDate(), -7));
    return older ? rows[0].kg - older.kg : null;
  }, [rows]);
  const bmi = !minor && last && person.height_cm ? last.kg / (person.height_cm / 100) ** 2 : null;

  return (
    <div className="stack">
      <form className="card row gap wrap" onSubmit={add}>
        <label className="grow">الوزن (كغ)<input inputMode="decimal" dir="ltr" placeholder="72.0" value={kg} onChange={(e) => setKg(e.target.value)} /></label>
        <label>التاريخ<input type="date" value={date} max={isoDate()} onChange={(e) => setDate(e.target.value)} /></label>
        <button className="btn primary self-end">حفظ</button>
      </form>

      <div className="card">
        <div className="row between">
          <h3>التقدم</h3>
          {first && last && first !== last && (
            <span className={'pill ' + (last.kg <= first.kg ? 'good' : 'warn')}>
              {last.kg <= first.kg ? '▼' : '▲'} {fmtKg(Math.abs(last.kg - first.kg))} كغ منذ {fmtShort(first.measured_on)}
            </span>
          )}
        </div>
        <WeightChart pts={pts} goal={minor ? null : person.goal_kg} color={person.color} />
        <div className="row gap wrap small muted" style={{ marginTop: 8 }}>
          {wk != null && !minor && <span>آخر أسبوع: {wk === 0 ? 'ثابت' : `${wk < 0 ? 'نزول' : 'زيادة'} ${fmtKg(Math.abs(wk))} كغ`}</span>}
          {bmi && <span>· BMI {bmi.toFixed(1)}</span>}
          {!minor && person.goal_kg && <span>· الهدف {fmtKg(person.goal_kg)} كغ</span>}
        </div>
        {!minor && <p className="muted small" style={{ marginTop: 6 }}>نزول نص كيلو بالأسبوع أو أقل هو الوتيرة الآمنة.</p>}
      </div>

      <div className="card">
        <h3>كل القياسات</h3>
        {rows === null ? <p className="muted">...</p> : rows.length === 0 ? <p className="muted">ما في قياسات بعد.</p> : (
          <ul className="list rows">
            {rows.map((r) => (
              <li key={r.id}><span>{fmtDate(r.measured_on)}</span><b>{fmtKg(r.kg)} كغ</b><button className="x" onClick={() => del(r.id)} aria-label="حذف">×</button></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function WeightChart({ pts, goal, color }) {
  if (pts.length < 2) return <p className="muted" style={{ marginTop: 8 }}>بعد قياسين بيظهر الرسم البياني.</p>;
  const W = 340, H = 170, P = { t: 12, r: 10, b: 22, l: 34 };
  const vals = pts.map((p) => Number(p.kg)).concat(goal ? [Number(goal)] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 2) { lo -= 1; hi += 1; }
  lo = Math.floor(lo - 0.3); hi = Math.ceil(hi + 0.3);
  const t0 = Date.parse(pts[0].measured_on), t1 = Date.parse(pts[pts.length - 1].measured_on) || t0 + 1;
  const x = (iso) => P.l + ((Date.parse(iso) - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.measured_on).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  const area = `${d} L${x(pts[pts.length - 1].measured_on).toFixed(1)},${H - P.b} L${x(pts[0].measured_on).toFixed(1)},${H - P.b} Z`;
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="رسم الوزن">
      <defs><linearGradient id="wg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".22" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {ticks.map((t) => (
        <g key={t}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="grid" /><text x={P.l - 6} y={y(t) + 4} textAnchor="end" className="axis">{Math.round(t * 10) / 10}</text></g>
      ))}
      <path d={area} fill="url(#wg)" />
      {goal && <><line x1={P.l} x2={W - P.r} y1={y(goal)} y2={y(goal)} className="goal" /><text x={W - P.r} y={y(goal) - 4} textAnchor="end" className="axis goal-t">الهدف</text></>}
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p) => <circle key={p.id} cx={x(p.measured_on)} cy={y(p.kg)} r="3" fill={color} />)}
      <text x={P.l} y={H - 4} className="axis">{fmtShort(pts[0].measured_on)}</text>
      <text x={W - P.r} y={H - 4} textAnchor="end" className="axis">{fmtShort(pts[pts.length - 1].measured_on)}</text>
    </svg>
  );
}

/* ---------- Food ---------- */
function Food({ household, person, flash, rev, openAdd }) {
  const [day, setDay] = useState(isoDate());
  const [rows, reload] = useRows('bh_meals', person, 'eaten_on', 30, rev);
  const [showMenus, setShowMenus] = useState(false);
  const minor = isMinor(person);

  const list = (rows ?? []).filter((m) => m.eaten_on === day);
  const total = list.reduce((s, m) => s + (m.kcal || 0), 0);
  const protein = list.reduce((s, m) => s + (m.protein_g || 0), 0);

  const insert = async (items) => {
    const { error } = await supabase.from('bh_meals').insert(items.map((m) => ({ household_id: household, person_id: person.id, eaten_on: day, ...m })));
    if (error) { flash('ما انحفظ'); return false; }
    reload(); return true;
  };
  const del = async (id) => { await supabase.from('bh_meals').delete().eq('id', id); reload(); };

  return (
    <div className="stack">
      <button className="card cta big" onClick={() => openAdd('meal')}>
        <span className="cta-ic">📷</span>
        <span className="grow"><b>سجّل وجبة</b><small className="muted">صوّر الصحن أو اكتب جملة، والمدرب بيرتّبها.</small></span>
        <span className="muted">‹</span>
      </button>

      <DayNav day={day} setDay={setDay} />

      <div className="card">
        <div className="row between"><h3>{day === isoDate() ? 'اليوم' : fmtDate(day)}</h3>{!minor && total > 0 && <span className="muted small">~{total} سعرة{protein ? ` · ${protein}غ بروتين` : ''}</span>}</div>
        {SLOTS.map((s) => {
          const items = list.filter((m) => m.slot === s.id);
          if (!items.length) return null;
          return (
            <div key={s.id} className="slot">
              <h4>{s.icon} {s.label}</h4>
              <ul className="list rows">
                {items.map((m) => <li key={m.id}><span className="grow">{m.description}</span>{!minor && m.kcal ? <span className="muted small">{m.kcal}</span> : null}<button className="x" onClick={() => del(m.id)} aria-label="حذف">×</button></li>)}
              </ul>
            </div>
          );
        })}
        {rows !== null && list.length === 0 && <p className="muted" style={{ marginTop: 8 }}>ما في وجبات مسجلة لهذا اليوم.</p>}
      </div>

      <div className="card">
        <button className="row between full plain" onClick={() => setShowMenus((v) => !v)}><h3>قوائم جاهزة من المطبخ البيتي</h3><span className="muted">{showMenus ? '▲' : '▼'}</span></button>
        {showMenus && (
          <div className="stack" style={{ marginTop: 8 }}>
            <p className="muted small">حلال، بدون دجاج وبدون خبز. اضغط «سجّل» لما تاكل الوجبة.</p>
            {MENUS.map((menu) => (
              <div key={menu.name} className="menu">
                <h4>{menu.name}</h4>
                {menu.meals.map((m) => (
                  <div key={m.title} className="menu-item">
                    <div className="grow"><b>{slotLabel(m.slot)}: {m.title}</b><p className="muted small">{m.items}{!minor && ` · ~${m.kcal}`}</p></div>
                    <button className="btn ghost sm" onClick={async () => { if (await insert([{ slot: m.slot, description: `${m.title} — ${m.items}`, kcal: minor ? null : m.kcal, source: 'menu' }])) flash('انسجلت ✓'); }}>سجّل</button>
                  </div>
                ))}
              </div>
            ))}
            <a className="btn ghost" href="https://cookpad.com/ps/%D8%A8%D8%AD%D8%AB/%D8%B5%D8%AD%D9%8A" target="_blank" rel="noreferrer">بحث وصفات صحية على كوكباد ↗</a>
          </div>
        )}
      </div>
    </div>
  );
}

function DayNav({ day, setDay }) {
  const today = isoDate();
  return (
    <div className="daynav">
      <button className="icon-btn" onClick={() => setDay(addDays(day, -1))} aria-label="اليوم السابق">›</button>
      <button className="plain" onClick={() => setDay(today)}>{day === today ? 'اليوم' : fmtDate(day)}</button>
      <button className="icon-btn" disabled={day >= today} onClick={() => setDay(addDays(day, 1))} aria-label="اليوم التالي">‹</button>
    </div>
  );
}

/* ---------- Sport ---------- */
function Sport({ household, person, flash, rev, refresh }) {
  const [rows, reload] = useRows('bh_workouts', person, 'done_on', 60, rev);
  const [kind, setKind] = useState('walk');
  const [minutes, setMinutes] = useState('30');
  const [steps, setSteps] = useState('');
  const [date, setDate] = useState(isoDate());
  const minor = isMinor(person);

  const add = async (e) => {
    e.preventDefault();
    const m = parseInt(minutes, 10);
    if (!(m > 0 && m <= 600)) return flash('عدد الدقائق مش منطقي');
    const s = parseInt(steps, 10);
    const { error } = await supabase.from('bh_workouts').insert({ household_id: household, person_id: person.id, kind, minutes: m, steps: Number.isFinite(s) ? s : null, done_on: date });
    if (error) return flash('ما انحفظ');
    setSteps(''); flash('يعطيك العافية 💪'); refresh();
  };
  const del = async (id) => { await supabase.from('bh_workouts').delete().eq('id', id); reload(); };

  const days = useMemo(() => {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(isoDate(), -i);
      out.push({ d, min: (rows ?? []).filter((r) => r.done_on === d).reduce((s, r) => s + r.minutes, 0) });
    }
    return out;
  }, [rows]);
  const target = minor ? 60 : 30;
  const max = Math.max(target * 1.5, ...days.map((d) => d.min));
  const week = days.reduce((s, d) => s + d.min, 0);

  return (
    <div className="stack">
      <div className="card">
        <div className="row between"><h3>آخر 7 أيام</h3><span className="muted small">{week} دقيقة</span></div>
        <div className="week">
          {days.map((d) => (
            <div key={d.d} className="wcol">
              <span className="wv">{d.min || ''}</span>
              <div className="wbar">
                <i className="wtarget" style={{ bottom: (target / max) * 100 + '%' }} />
                <span style={{ height: (d.min / max) * 100 + '%', background: d.min >= target ? person.color : `color-mix(in srgb, ${person.color} 55%, transparent)` }} />
              </div>
              <span className={'wd' + (d.d === isoDate() ? ' now' : '')}>{new Date(d.d + 'T12:00:00').toLocaleDateString('ar', { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>
        <p className="muted small">{minor ? 'الهدف: ساعة حركة كل يوم (لعب، مشي، رياضة).' : 'الهدف: 30 دقيقة باليوم، 150 بالأسبوع.'} الخط المنقّط هو هدف اليوم.</p>
      </div>

      <form className="card stack" onSubmit={add}>
        <h3>تسجيل نشاط</h3>
        <div className="kinds">
          {KINDS.map((k) => <button type="button" key={k.id} className={kind === k.id ? 'on' : ''} onClick={() => setKind(k.id)}><span>{k.icon}</span>{k.label}</button>)}
        </div>
        <div className="row gap wrap">
          <label className="grow">دقائق<input inputMode="numeric" dir="ltr" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} /></label>
          <label className="grow">خطوات (اختياري)<input inputMode="numeric" dir="ltr" value={steps} onChange={(e) => setSteps(e.target.value.replace(/\D/g, ''))} /></label>
          <label>التاريخ<input type="date" value={date} max={isoDate()} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <button className="btn primary">حفظ</button>
      </form>

      <div className="card">
        <h3>السجل</h3>
        {rows === null ? <p className="muted">...</p> : rows.length === 0 ? <p className="muted">ما في نشاط مسجل بعد.</p> : (
          <ul className="list rows">
            {rows.slice(0, 40).map((r) => (
              <li key={r.id}><span className="nowrap">{kindOf(r.kind).icon} {kindOf(r.kind).label}</span><span className="muted small">{fmtDate(r.done_on)}</span><b>{r.minutes} د</b><button className="x" onClick={() => del(r.id)} aria-label="حذف">×</button></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------- People ---------- */
const EMPTY = { name: '', birth_year: '', sex: '', height_cm: '', goal_kg: '', activity: 'light', restrictions: 'حلال', color: COLORS[0] };

function PeopleSheet({ household, people, startNew, onClose, onChanged, flash }) {
  const [edit, setEdit] = useState(startNew ? { ...EMPTY, color: COLORS[people.length % COLORS.length] } : null);
  const newOne = () => setEdit({ ...EMPTY, color: COLORS[people.length % COLORS.length] });
  const save = async (e) => {
    e.preventDefault();
    const num = (v) => (v === '' || v == null ? null : Number(v));
    const row = { household_id: household, name: edit.name.trim(), birth_year: num(edit.birth_year), sex: edit.sex || null, height_cm: num(edit.height_cm), goal_kg: num(edit.goal_kg), activity: edit.activity, restrictions: edit.restrictions.trim(), color: edit.color };
    if (!row.name) return;
    const q = edit.id ? supabase.from('bh_people').update(row).eq('id', edit.id).select().single() : supabase.from('bh_people').insert(row).select().single();
    const { data, error } = await q;
    if (error) return flash('ما انحفظ — تأكد من الأرقام');
    flash('انحفظ ✓'); setEdit(null); onChanged(data.id);
  };
  const remove = async () => {
    if (!confirm(`حذف ${edit.name} وكل السجلات تبعه/ا؟`)) return;
    await supabase.from('bh_people').delete().eq('id', edit.id);
    setEdit(null); onChanged(null);
  };
  const minorEdit = edit?.birth_year && new Date().getFullYear() - Number(edit.birth_year) < 18;

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="أفراد العيلة">
        <div className="grabber" />
        <div className="row between"><h3>{edit ? (edit.id ? 'تعديل' : 'فرد جديد') : 'أفراد العيلة'}</h3><button className="icon-btn" onClick={edit && !startNew ? () => setEdit(null) : onClose} aria-label="إغلاق">×</button></div>
        {!edit ? (
          <div className="stack">
            {people.map((p) => (
              <button key={p.id} className="person-row" onClick={() => setEdit({ ...EMPTY, ...p, birth_year: p.birth_year ?? '', height_cm: p.height_cm ?? '', goal_kg: p.goal_kg ?? '', sex: p.sex ?? '' })}>
                <span className="avatar lg" style={{ background: p.color }}>{p.name.slice(0, 1)}</span><b className="grow">{p.name}</b><span className="muted small">{ageOf(p) != null ? `${ageOf(p)} سنة` : ''}</span><span>✎</span>
              </button>
            ))}
            <button className="btn primary" onClick={newOne}>+ إضافة فرد</button>
            <button className="btn ghost" onClick={() => supabase.auth.signOut()}>تسجيل خروج</button>
          </div>
        ) : (
          <form className="stack" onSubmit={save}>
            <label>الاسم<input value={edit.name} maxLength={60} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required /></label>
            <div className="row gap">
              <label className="grow">سنة الميلاد<input inputMode="numeric" dir="ltr" value={edit.birth_year} onChange={(e) => setEdit({ ...edit, birth_year: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></label>
              <label className="grow">الجنس<select value={edit.sex} onChange={(e) => setEdit({ ...edit, sex: e.target.value })}><option value="">—</option><option value="m">ذكر</option><option value="f">أنثى</option></select></label>
            </div>
            <div className="row gap">
              <label className="grow">الطول (سم)<input inputMode="decimal" dir="ltr" value={edit.height_cm} onChange={(e) => setEdit({ ...edit, height_cm: e.target.value })} /></label>
              {!minorEdit && <label className="grow">الوزن الهدف (كغ)<input inputMode="decimal" dir="ltr" value={edit.goal_kg} onChange={(e) => setEdit({ ...edit, goal_kg: e.target.value })} /></label>}
            </div>
            <label>مستوى الحركة<select value={edit.activity} onChange={(e) => setEdit({ ...edit, activity: e.target.value })}>{ACTIVITY.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
            <label>قيود الأكل<input value={edit.restrictions} maxLength={400} placeholder="حلال، بدون دجاج..." onChange={(e) => setEdit({ ...edit, restrictions: e.target.value })} /></label>
            <div className="colors">{COLORS.map((c) => <button type="button" key={c} className={edit.color === c ? 'on' : ''} style={{ background: c }} onClick={() => setEdit({ ...edit, color: c })} aria-label="لون" />)}</div>
            {minorEdit && <p className="note small">للأولاد تحت 18: التطبيق بيركّز على أكل متوازن وحركة، بدون أهداف وزن أو سعرات.</p>}
            <button className="btn primary">حفظ</button>
            {edit.id && <button type="button" className="btn danger" onClick={remove}>حذف الفرد</button>}
          </form>
        )}
      </div>
    </div>
  );
}
