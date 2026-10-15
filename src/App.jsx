import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';
import { SLOTS, slotLabel, KINDS, kindOf, ACTIVITY, COLORS, MENUS } from './data.js';

/* ---------- helpers ---------- */
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDate(d); };
const fmtDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('ar', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtShort = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('ar', { day: 'numeric', month: 'short' });
const fmtKg = (n) => (n == null ? '—' : Number(n).toLocaleString('ar', { maximumFractionDigits: 1 }));
const ageOf = (p) => (p?.birth_year ? new Date().getFullYear() - p.birth_year : null);
const isMinor = (p) => { const a = ageOf(p); return a != null && a < 18; };
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

const TABS = [
  { id: 'home', label: 'اليوم', icon: '🏠' },
  { id: 'weight', label: 'الوزن', icon: '⚖️' },
  { id: 'food', label: 'الأكل', icon: '🥗' },
  { id: 'sport', label: 'الحركة', icon: '🏃' },
  { id: 'coach', label: 'المدرب', icon: '✨' },
];

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
  const magic = async () => {
    if (!email.trim()) { setMsg('اكتب البريد أولاً.'); return; }
    setBusy(true); setMsg('');
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: window.location.origin } });
    setBusy(false);
    setMsg(error ? 'ما قدرنا نبعت الرابط. جرّب كلمة السر.' : 'بعتنالك رابط دخول على البريد.');
  };
  return (
    <div className="login">
      <img src="/icon.svg" alt="" width="72" height="72" />
      <h1>بيت الصحة</h1>
      <p className="muted">متابعة الأكل والوزن والحركة للعيلة. ادخل بنفس حساب «بيتنا».</p>
      <form onSubmit={submit} className="card stack">
        <label>البريد الإلكتروني<input type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>كلمة السر<input type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="btn primary" disabled={busy}>{busy ? '...' : 'دخول'}</button>
        <button type="button" className="btn ghost" onClick={magic} disabled={busy}>ابعتلي رابط دخول بالبريد</button>
        {msg && <p className="note">{msg}</p>}
      </form>
    </div>
  );
}

function Shell({ session }) {
  const [household, setHousehold] = useState(undefined);
  const [people, setPeople] = useState([]);
  const [personId, setPersonId] = useState(lsGet('bh.person'));
  const [tab, setTab] = useState(lsGet('bh.tab') || 'home');
  const [showPeople, setShowPeople] = useState(false);
  const [toast, setToast] = useState('');

  const flash = useCallback((t) => { setToast(t); setTimeout(() => setToast(''), 2200); }, []);

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

  const ctx = { household, person, people, flash };

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><img src="/icon.svg" alt="" width="28" height="28" /><span>بيت الصحة</span></div>
        <button className="icon-btn" onClick={() => setShowPeople(true)} aria-label="أفراد العيلة">👨‍👩‍👧‍👦</button>
      </header>

      <nav className="people-bar" aria-label="اختيار الفرد">
        {people.map((p) => (
          <button key={p.id} className={'chip' + (p.id === person?.id ? ' on' : '')} style={{ '--c': p.color }} onClick={() => setPersonId(p.id)}>
            <span className="dot" />{p.name}
          </button>
        ))}
        <button className="chip add" onClick={() => setShowPeople(true)}>+ فرد</button>
      </nav>

      <main className="content">
        {!person ? (
          <div className="card empty">
            <p>ابدأ بإضافة أفراد العيلة.</p>
            <button className="btn primary" onClick={() => setShowPeople(true)}>إضافة فرد</button>
          </div>
        ) : (
          <>
            {tab === 'home' && <Home {...ctx} go={setTab} />}
            {tab === 'weight' && <Weight {...ctx} />}
            {tab === 'food' && <Food {...ctx} />}
            {tab === 'sport' && <Sport {...ctx} />}
            {tab === 'coach' && <Coach {...ctx} />}
          </>
        )}
      </main>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span className="ti">{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </nav>

      {showPeople && (
        <PeopleSheet household={household} people={people} onClose={() => setShowPeople(false)}
          onChanged={async (id) => { await loadPeople(); if (id) setPersonId(id); }} flash={flash} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ---------- data hook ---------- */
function useRows(table, person, dateCol, days, extraDeps = []) {
  const [rows, setRows] = useState(null);
  const reload = useCallback(async () => {
    if (!person) return;
    let q = supabase.from(table).select('*').eq('person_id', person.id).order(dateCol, { ascending: false }).order('created_at', { ascending: false });
    if (days) q = q.gte(dateCol, addDays(isoDate(), -days));
    const { data } = await q.limit(500);
    setRows(data ?? []);
  }, [table, person?.id, dateCol, days, ...extraDeps]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setRows(null); reload(); }, [reload]);
  return [rows, reload];
}

/* ---------- Home ---------- */
function Home({ person, go }) {
  const [weights] = useRows('bh_weights', person, 'measured_on', 120);
  const [meals] = useRows('bh_meals', person, 'eaten_on', 1);
  const [workouts] = useRows('bh_workouts', person, 'done_on', 7);
  const minor = isMinor(person);
  const today = isoDate();
  const last = weights?.[0];
  const todayMeals = (meals ?? []).filter((m) => m.eaten_on === today);
  const kcal = todayMeals.reduce((s, m) => s + (m.kcal || 0), 0);
  const weekStart = addDays(today, -6);
  const weekMin = (workouts ?? []).filter((w) => w.done_on >= weekStart).reduce((s, w) => s + w.minutes, 0);
  const target = minor ? 420 : 150;
  const bmi = !minor && last && person.height_cm ? last.kg / (person.height_cm / 100) ** 2 : null;
  const toGoal = !minor && last && person.goal_kg ? last.kg - person.goal_kg : null;

  return (
    <div className="stack">
      <h2 className="hello">أهلا {person.name} 👋</h2>
      <div className="grid2">
        <button className="card stat" onClick={() => go('weight')}>
          <span className="lbl">آخر وزن</span>
          <span className="big">{fmtKg(last?.kg)} <small>كغ</small></span>
          <span className="sub">{last ? fmtDate(last.measured_on) : 'سجّل أول قياس'}</span>
        </button>
        {minor ? (
          <button className="card stat" onClick={() => go('food')}>
            <span className="lbl">وجبات اليوم</span>
            <span className="big">{todayMeals.length}</span>
            <span className="sub">{todayMeals.some((m) => m.slot === 'breakfast') ? 'فطرت اليوم ✓' : 'لا تنسَ الفطور'}</span>
          </button>
        ) : (
          <button className="card stat" onClick={() => go('weight')}>
            <span className="lbl">للهدف</span>
            <span className="big">{toGoal == null ? '—' : toGoal <= 0 ? '✓' : fmtKg(toGoal)} {toGoal > 0 && <small>كغ</small>}</span>
            <span className="sub">{person.goal_kg ? `الهدف ${fmtKg(person.goal_kg)} كغ` : 'حدّد هدف من الملف'}{bmi ? ` · BMI ${bmi.toFixed(1)}` : ''}</span>
          </button>
        )}
      </div>

      <div className="card">
        <div className="row between"><h3>الحركة هذا الأسبوع</h3><span className="muted">{weekMin} / {target} دقيقة</span></div>
        <div className="bar"><span style={{ width: Math.min(100, (weekMin / target) * 100) + '%' }} /></div>
        <p className="muted small">{minor ? 'الهدف للأولاد: ساعة حركة باليوم.' : 'التوصية: 150 دقيقة حركة معتدلة بالأسبوع.'}</p>
      </div>

      <div className="card">
        <div className="row between"><h3>أكل اليوم</h3>{!minor && kcal > 0 && <span className="muted">~{kcal} سعرة</span>}</div>
        {todayMeals.length === 0 ? <p className="muted">لسا ما سجّلت أكل اليوم.</p> : (
          <ul className="list">
            {todayMeals.map((m) => <li key={m.id}><b>{slotLabel(m.slot)}</b> · {m.description}</li>)}
          </ul>
        )}
        <div className="row gap">
          <button className="btn primary sm" onClick={() => go('food')}>+ وجبة</button>
          <button className="btn ghost sm" onClick={() => go('coach')}>✨ اقتراح قائمة</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Weight ---------- */
function Weight({ household, person, flash }) {
  const [rows, reload] = useRows('bh_weights', person, 'measured_on', null);
  const [kg, setKg] = useState('');
  const [date, setDate] = useState(isoDate());
  const minor = isMinor(person);

  const add = async (e) => {
    e.preventDefault();
    const v = parseFloat(String(kg).replace(',', '.'));
    if (!(v > 10 && v < 400)) return flash('رقم الوزن مش منطقي');
    const { error } = await supabase.from('bh_weights').insert({ household_id: household, person_id: person.id, kg: v, measured_on: date });
    if (error) return flash('ما انحفظ، جرّب مرة ثانية');
    setKg(''); flash('انحفظ ✓'); reload();
  };
  const del = async (id) => { if (!confirm('حذف القياس؟')) return; await supabase.from('bh_weights').delete().eq('id', id); reload(); };

  const pts = useMemo(() => [...(rows ?? [])].reverse().slice(-60), [rows]);
  const first = pts[0], last = pts[pts.length - 1];
  const wk = useMemo(() => {
    if (!rows?.length) return null;
    const cut = addDays(isoDate(), -7);
    const older = rows.find((r) => r.measured_on <= cut);
    return older ? rows[0].kg - older.kg : null;
  }, [rows]);

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
              {last.kg <= first.kg ? '▼' : '▲'} {fmtKg(Math.abs(last.kg - first.kg))} كغ منذ {fmtDate(first.measured_on)}
            </span>
          )}
        </div>
        <WeightChart pts={pts} goal={minor ? null : person.goal_kg} color={person.color} />
        {wk != null && !minor && <p className="muted small">آخر أسبوع: {wk > 0 ? '+' : ''}{fmtKg(wk)} كغ. نزول نص كيلو بالأسبوع أو أقل هو الوتيرة الآمنة.</p>}
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
  if (pts.length < 2) return <p className="muted">بعد قياسين بيظهر الرسم البياني.</p>;
  const W = 340, H = 170, P = { t: 12, r: 10, b: 22, l: 34 };
  const vals = pts.map((p) => Number(p.kg)).concat(goal ? [Number(goal)] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 2) { lo -= 1; hi += 1; }
  lo = Math.floor(lo - 0.3); hi = Math.ceil(hi + 0.3);
  const t0 = Date.parse(pts[0].measured_on), t1 = Date.parse(pts[pts.length - 1].measured_on) || t0 + 1;
  const x = (iso) => P.l + ((Date.parse(iso) - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.measured_on).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" dir="ltr" role="img" aria-label="رسم الوزن">
      {ticks.map((t) => (
        <g key={t}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="grid" /><text x={P.l - 6} y={y(t) + 4} textAnchor="end" className="axis">{Math.round(t * 10) / 10}</text></g>
      ))}
      {goal && <><line x1={P.l} x2={W - P.r} y1={y(goal)} y2={y(goal)} className="goal" /><text x={W - P.r} y={y(goal) - 4} textAnchor="end" className="axis goal-t">الهدف</text></>}
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p) => <circle key={p.id} cx={x(p.measured_on)} cy={y(p.kg)} r="3" fill={color} />)}
      <text x={P.l} y={H - 4} className="axis">{fmtShort(pts[0].measured_on)}</text>
      <text x={W - P.r} y={H - 4} textAnchor="end" className="axis">{fmtShort(pts[pts.length - 1].measured_on)}</text>
    </svg>
  );
}

/* ---------- Food ---------- */
function Food({ household, person, flash }) {
  const [day, setDay] = useState(isoDate());
  const [rows, reload] = useRows('bh_meals', person, 'eaten_on', 30);
  const [slot, setSlot] = useState(defaultSlot());
  const [desc, setDesc] = useState('');
  const [kcal, setKcal] = useState('');
  const [showMenus, setShowMenus] = useState(false);
  const minor = isMinor(person);

  const list = (rows ?? []).filter((m) => m.eaten_on === day);
  const total = list.reduce((s, m) => s + (m.kcal || 0), 0);

  const insert = async (items) => {
    const { error } = await supabase.from('bh_meals').insert(items.map((m) => ({ household_id: household, person_id: person.id, eaten_on: day, ...m })));
    if (error) { flash('ما انحفظ'); return false; }
    reload(); return true;
  };
  const add = async (e) => {
    e.preventDefault();
    if (!desc.trim()) return;
    const k = parseInt(kcal, 10);
    if (await insert([{ slot, description: desc.trim(), kcal: Number.isFinite(k) ? k : null }])) { setDesc(''); setKcal(''); flash('انضافت ✓'); }
  };
  const del = async (id) => { await supabase.from('bh_meals').delete().eq('id', id); reload(); };

  return (
    <div className="stack">
      <DayNav day={day} setDay={setDay} />
      <form className="card stack" onSubmit={add}>
        <div className="seg">
          {SLOTS.map((s) => <button type="button" key={s.id} className={slot === s.id ? 'on' : ''} onClick={() => setSlot(s.id)}>{s.icon} {s.label}</button>)}
        </div>
        <label>شو أكلت؟<textarea rows="2" placeholder="مثلاً: صحن مجدّرة وسلطة ولبن" value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
        <div className="row gap">
          {!minor && <label className="grow">سعرات (اختياري)<input inputMode="numeric" dir="ltr" value={kcal} onChange={(e) => setKcal(e.target.value.replace(/\D/g, ''))} /></label>}
          <button className="btn primary self-end">إضافة</button>
        </div>
      </form>

      <div className="card">
        <div className="row between"><h3>{day === isoDate() ? 'اليوم' : fmtDate(day)}</h3>{!minor && total > 0 && <span className="muted">~{total} سعرة</span>}</div>
        {SLOTS.map((s) => {
          const items = list.filter((m) => m.slot === s.id);
          if (!items.length) return null;
          return (
            <div key={s.id} className="slot">
              <h4>{s.icon} {s.label}</h4>
              <ul className="list rows">
                {items.map((m) => <li key={m.id}><span className="grow">{m.description}</span>{!minor && m.kcal ? <span className="muted">{m.kcal}</span> : null}<button className="x" onClick={() => del(m.id)} aria-label="حذف">×</button></li>)}
              </ul>
            </div>
          );
        })}
        {rows !== null && list.length === 0 && <p className="muted">ما في وجبات مسجلة لهذا اليوم.</p>}
      </div>

      <div className="card">
        <button className="row between full plain" onClick={() => setShowMenus((v) => !v)}><h3>قوائم جاهزة من المطبخ البيتي</h3><span>{showMenus ? '▲' : '▼'}</span></button>
        {showMenus && (
          <div className="stack">
            <p className="muted small">حلال، بدون دجاج وبدون خبز. اضغط «سجّل» لما تاكل الوجبة.</p>
            {MENUS.map((menu) => (
              <div key={menu.name} className="menu">
                <h4>{menu.name}</h4>
                {menu.meals.map((m) => (
                  <div key={m.title} className="menu-item">
                    <div className="grow"><b>{slotLabel(m.slot)}: {m.title}</b><p className="muted small">{m.items}{!minor && ` · ~${m.kcal}`}</p></div>
                    <button className="btn ghost sm" onClick={async () => { if (await insert([{ slot: m.slot, description: `${m.title} — ${m.items}`, kcal: minor ? null : m.kcal }])) flash('انسجلت ✓'); }}>سجّل</button>
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

function defaultSlot() {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 18 ? 'snack' : 'dinner';
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
function Sport({ household, person, flash }) {
  const [rows, reload] = useRows('bh_workouts', person, 'done_on', 60);
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
    setSteps(''); flash('يعطيك العافية 💪'); reload();
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
  const max = Math.max(60, ...days.map((d) => d.min));
  const week = days.reduce((s, d) => s + d.min, 0);

  return (
    <div className="stack">
      <form className="card stack" onSubmit={add}>
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
        <div className="row between"><h3>آخر 7 أيام</h3><span className="muted">{week} دقيقة</span></div>
        <div className="week">
          {days.map((d) => (
            <div key={d.d} className="wcol">
              <span className="wv">{d.min || ''}</span>
              <div className="wbar"><span style={{ height: (d.min / max) * 100 + '%', background: person.color }} /></div>
              <span className="wd">{new Date(d.d + 'T12:00:00').toLocaleDateString('ar', { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>
        <p className="muted small">{minor ? 'الهدف: ساعة حركة كل يوم (لعب، مشي، رياضة).' : 'الهدف: 150 دقيقة بالأسبوع — مثلاً 30 دقيقة مشي 5 أيام.'}</p>
      </div>

      <div className="card">
        <h3>السجل</h3>
        {rows === null ? <p className="muted">...</p> : rows.length === 0 ? <p className="muted">ما في نشاط مسجل بعد.</p> : (
          <ul className="list rows">
            {rows.slice(0, 40).map((r) => (
              <li key={r.id}><span className="nowrap">{kindOf(r.kind).icon} {kindOf(r.kind).label}</span><span className="muted">{fmtDate(r.done_on)}</span><b>{r.minutes} د</b>{r.steps ? <span className="muted">{r.steps.toLocaleString('ar')} خطوة</span> : null}<button className="x" onClick={() => del(r.id)} aria-label="حذف">×</button></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------- Coach ---------- */
const ERRORS = {
  quota: 'وصلت للحد اليومي للمدرب (25 طلب). جرّب بكرا.',
  ai_not_configured: 'المدرب الذكي مش مفعّل بعد.',
  ai_busy: 'المدرب مشغول هلّق، جرّب بعد دقيقة.',
  ai_key_invalid: 'في مشكلة بمفتاح الذكاء الاصطناعي.',
};

function Coach({ household, person, flash }) {
  const [busy, setBusy] = useState('');
  const [res, setRes] = useState(null);
  const [question, setQuestion] = useState('');
  const minor = isMinor(person);

  useEffect(() => { setRes(null); }, [person.id]);

  const call = async (mode) => {
    setBusy(mode); setRes(null);
    const { data, error } = await supabase.functions.invoke('bh-coach', { body: { mode, person_id: person.id, question, today: isoDate() } });
    setBusy('');
    if (error) {
      let code = '';
      try { code = (await error.context.json()).error; } catch { /* ignore */ }
      return flash(ERRORS[code] || 'صار خطأ، جرّب مرة ثانية');
    }
    setRes({ mode, ...data.result });
  };

  const logMeal = async (m) => {
    const { error } = await supabase.from('bh_meals').insert({ household_id: household, person_id: person.id, eaten_on: isoDate(), slot: m.slot, description: `${m.title} — ${m.items}`, kcal: minor ? null : m.kcal || null });
    flash(error ? 'ما انحفظ' : 'انسجلت ✓');
  };

  return (
    <div className="stack">
      <div className="card coach-head">
        <h3>✨ المدرب الذكي</h3>
        <p className="muted small">بيقرا سجل {person.name} (وزن، أكل، حركة) ويقترح بحسبه. {person.restrictions ? `القيود: ${person.restrictions}.` : ''}</p>
        <div className="row gap wrap">
          <button className="btn primary" disabled={!!busy} onClick={() => call('plan')}>{busy === 'plan' ? 'لحظة...' : 'اقترح قائمة لليوم'}</button>
          <button className="btn ghost" disabled={!!busy} onClick={() => call('week')}>{busy === 'week' ? 'لحظة...' : 'راجع أسبوعي'}</button>
        </div>
      </div>

      <form className="card stack" onSubmit={(e) => { e.preventDefault(); if (question.trim().length > 1) call('ask'); }}>
        <label>اسأل المدرب<textarea rows="2" placeholder="مثلاً: شو بديل صحي للحلو بعد الغدا؟" value={question} onChange={(e) => setQuestion(e.target.value)} /></label>
        <button className="btn ghost" disabled={!!busy}>{busy === 'ask' ? 'لحظة...' : 'اسأل'}</button>
      </form>

      {res?.mode === 'plan' && (
        <div className="card stack">
          <p>{res.intro}</p>
          {(res.meals ?? []).map((m, i) => (
            <div key={i} className="menu-item">
              <div className="grow"><b>{slotLabel(m.slot)}: {m.title}</b><p className="muted small">{m.items}{!minor && m.kcal ? ` · ~${m.kcal}` : ''}</p></div>
              <button className="btn ghost sm" onClick={() => logMeal(m)}>سجّل</button>
            </div>
          ))}
          {res.activity && <p className="tipbox">🏃 {res.activity}</p>}
        </div>
      )}
      {res?.mode === 'week' && (
        <div className="card stack">
          <h3>{res.headline}</h3>
          {(res.points ?? []).map((p, i) => (
            <div key={i} className={'point ' + p.kind}><b>{p.title}</b><p>{p.text}</p></div>
          ))}
        </div>
      )}
      {res?.mode === 'ask' && <div className="card"><p className="pre">{res.answer}</p></div>}
      <p className="muted small center">اقتراحات عامة، مش بديل عن طبيب أو أخصائي تغذية.</p>
    </div>
  );
}

/* ---------- People ---------- */
const EMPTY = { name: '', birth_year: '', sex: '', height_cm: '', goal_kg: '', activity: 'light', restrictions: 'حلال', color: COLORS[0] };

function PeopleSheet({ household, people, onClose, onChanged, flash }) {
  const [edit, setEdit] = useState(null);
  const startNew = () => setEdit({ ...EMPTY, color: COLORS[people.length % COLORS.length] });
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
        <div className="row between"><h3>{edit ? (edit.id ? 'تعديل' : 'فرد جديد') : 'أفراد العيلة'}</h3><button className="icon-btn" onClick={edit ? () => setEdit(null) : onClose} aria-label="إغلاق">×</button></div>
        {!edit ? (
          <div className="stack">
            {people.map((p) => (
              <button key={p.id} className="person-row" onClick={() => setEdit({ ...EMPTY, ...p, birth_year: p.birth_year ?? '', height_cm: p.height_cm ?? '', goal_kg: p.goal_kg ?? '', sex: p.sex ?? '' })}>
                <span className="dot" style={{ background: p.color }} /><b className="grow">{p.name}</b><span className="muted small">{ageOf(p) != null ? `${ageOf(p)} سنة` : ''}</span><span>✎</span>
              </button>
            ))}
            <button className="btn primary" onClick={startNew}>+ إضافة فرد</button>
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
