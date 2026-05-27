import { useState, useEffect, useMemo } from "react";
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, LineChart,
} from "recharts";
import {
  LayoutDashboard, Scale, Activity, Dumbbell, Plus, Trash2,
  Target, Flame, TrendingDown, Settings, Upload, Check,
  CalendarDays, Clock, ListChecks, Footprints,
} from "lucide-react";
import Papa from "papaparse";

/* ---------- constants: the locked plan ---------- */
const TARGET = { weight: 63, lbmReal: 57, lbmStretch: 58, bf: 0.12 };
const PLAN = [
  { m: 0, w: 74, lbm: 54 }, { m: 1, w: 70, lbm: 53 }, { m: 2, w: 66, lbm: 52.5 },
  { m: 3, w: 65, lbm: 53.5 }, { m: 4, w: 64.5, lbm: 54.5 }, { m: 5, w: 64, lbm: 55.5 },
  { m: 6, w: 63.5, lbm: 56.5 },
];
const PHASES = [
  { name: "強制カット", sub: "→ 66kg", start: 0, end: 55,
    kcal: "1,550–1,650", p: "180", f: "50–55", c: "90–110" },
  { name: "リコンプ", sub: "筋肉を乗せる", start: 56, end: 118,
    kcal: "2,000–2,100", p: "160", f: "60", c: "210–230" },
  { name: "仕上げ", sub: "目標体脂肪へ", start: 119, end: 181,
    kcal: "1,750–1,850", p: "170", f: "55", c: "140–160" },
  { name: "維持", sub: "一生これ", start: 182, end: 99999,
    kcal: "2,200–2,400", p: "150", f: "65", c: "270–290" },
];
const LIFTS = ["スクワット", "ブルガリアンスクワット", "ベンチプレス", "デッドリフト", "ショルダープレス",
  "懸垂", "ベントオーバーロウ", "ルーマニアンDL", "ヒップスラスト", "ディップス", "その他"];

/* ---------- weekly training schedule (Phase 1 base; tune once we know your level) ---------- */
const SCHEDULE = [
  { dow: 1, day: "月", title: "下半身 / スクワット", kind: "lift", items: [
    { n: "バックスクワット", s: "4×5" }, { n: "ルーマニアンDL", s: "3×8" },
    { n: "ブルガリアンスクワット", s: "3×10 / 脚" }, { n: "レッグカール", s: "3×12" },
    { n: "カーフレイズ", s: "4×15" } ] },
  { dow: 2, day: "火", title: "上半身プッシュ", kind: "lift", items: [
    { n: "ベンチプレス", s: "4×6" }, { n: "ショルダープレス", s: "3×8" },
    { n: "インクラインDBプレス", s: "3×10" }, { n: "ディップス", s: "3×10" },
    { n: "トライセプス", s: "3×12" } ] },
  { dow: 3, day: "水", title: "コンディショニング", kind: "cond", items: [
    { n: "ボクシング / インターバル", s: "30–40分" }, { n: "コア", s: "3セット" } ] },
  { dow: 4, day: "木", title: "下半身 / ヒンジ", kind: "lift", items: [
    { n: "デッドリフト", s: "4×4" }, { n: "ヒップスラスト", s: "3×8" },
    { n: "フロントスクワット", s: "3×10" }, { n: "レッグカール", s: "3×12" },
    { n: "カーフレイズ", s: "4×15" } ] },
  { dow: 5, day: "金", title: "上半身プル", kind: "lift", items: [
    { n: "懸垂", s: "4×6" }, { n: "ベントオーバーロウ", s: "4×8" },
    { n: "ラットプルダウン", s: "3×10" }, { n: "フェイスプル", s: "3×15" },
    { n: "バイセップスカール", s: "3×12" } ] },
  { dow: 6, day: "土", title: "機能性 / 任意", kind: "cond", items: [
    { n: "ケトルベルスイング", s: "5×10" }, { n: "ファーマーズキャリー", s: "4セット" },
    { n: "スプリント / スレッド", s: "20分" }, { n: "モビリティ", s: "10分" } ] },
  { dow: 0, day: "日", title: "休養", kind: "rest", items: [
    { n: "完全休養 / 散歩・ストレッチ", s: "—" } ] },
];

/* ---------- storage adapter (localStorage — persists in any browser) ---------- */
const store = {
  async get(k, fb) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; }
    catch (e) { return fb; }
  },
  async set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

/* ---------- helpers ---------- */
const DAY = 864e5;
const r1 = (n) => Math.round(n * 10) / 10;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const uid = () => Math.random().toString(36).slice(2, 9);
const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / DAY);

// 7-day trailing moving average over the weight log
function withMA(log) {
  const s = [...log].sort((a, b) => a.date.localeCompare(b.date));
  return s.map((e) => {
    const t = new Date(e.date).getTime();
    const win = s.filter((x) => { const xt = new Date(x.date).getTime(); return xt <= t && xt > t - 7 * DAY; });
    return { ...e, ma: r1(win.reduce((a, x) => a + x.weight, 0) / win.length) };
  });
}
function phaseFor(days) {
  return PHASES.find((p) => days >= p.start && days <= p.end) || PHASES[PHASES.length - 1];
}
const est1RM = (w, reps) => (w > 0 && reps > 0 ? r1(w * (1 + reps / 30)) : null);

/* ---------- Hevy CSV import ---------- */
const MONTHS = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
// Hevy start_time looks like "28 Mar 2025, 17:29" -> "2025-03-28"
function parseHevyDate(s) {
  const m = String(s).match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/);
  if (!m || !MONTHS[m[2]]) return null;
  return `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, "0")}`;
}
// map Hevy's exercise titles (EN or JP) onto our labels; keep original if unknown
function mapExercise(title = "") {
  const t = title.toLowerCase();
  if (t.includes("bulgarian") || t.includes("ブルガリアン")) return "ブルガリアンスクワット";
  if (t.includes("romanian") || t.includes("ルーマニア")) return "ルーマニアンDL";
  if (t.includes("squat") || t.includes("スクワット")) return "スクワット";
  if (t.includes("bench") || t.includes("ベンチ")) return "ベンチプレス";
  if (t.includes("deadlift") || t.includes("デッドリフト")) return "デッドリフト";
  if (t.includes("overhead") || t.includes("shoulder") || t.includes("military") || t.includes("ショルダー")) return "ショルダープレス";
  if (t.includes("pull up") || t.includes("pull-up") || t.includes("chin") || t.includes("懸垂")) return "懸垂";
  if (t.includes("row") || t.includes("ロウ")) return "ベントオーバーロウ";
  if (t.includes("hip thrust") || t.includes("ヒップ")) return "ヒップスラスト";
  if (t.includes("dip") || t.includes("ディップ")) return "ディップス";
  return title || "その他";
}
// rows -> one entry per (workout, exercise): top working set + working-set count
function parseHevyCSV(rows) {
  const groups = {};
  for (const row of rows) {
    const type = (row.set_type || "normal").toLowerCase();
    if (type === "warmup") continue;
    const date = parseHevyDate(row.start_time);
    if (!date) continue;
    const title = row.exercise_title || "";
    const kg = row.weight_kg ?? row.weight_lbs ?? row.weight ?? "";
    let weight = parseFloat(kg) || 0;
    if (row.weight_kg == null && row.weight_lbs != null) weight = r1(weight * 0.453592);
    const reps = parseInt(row.reps) || 0;
    if (reps === 0 && weight === 0) continue;
    const key = date + "|" + (row.start_time || "") + "|" + title;
    const g = groups[key] || { date, ex: mapExercise(title), sets: 0, best: { weight: -1, reps: 0 } };
    g.sets += 1;
    if (weight > g.best.weight || (weight === g.best.weight && reps > g.best.reps))
      g.best = { weight, reps };
    groups[key] = g;
  }
  return Object.values(groups).map((g) => ({
    id: uid(), date: g.date, ex: g.ex, weight: r1(g.best.weight), reps: g.best.reps, sets: g.sets,
  }));
}

// minutes between two "HH:MM" times (same day); null if invalid/negative
function minutesBetween(a, b) {
  if (!a || !b) return null;
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  const d = (bh * 60 + bm) - (ah * 60 + am);
  return d > 0 ? d : null;
}
const fmtMin = (m) => (m == null ? "—" : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`);

/* ---------- theme ---------- */
const C = {
  bg: "#0d0e0c", panel: "#161813", panel2: "#1c1f18", line: "#2a2e25",
  ink: "#edefe6", muted: "#8d9183", accent: "#c5f63d", teal: "#5dcaa5",
  warn: "#f0a23c", danger: "#e2674b",
};

export default function App() {
  const [tab, setTab] = useState("dash");
  const [loaded, setLoaded] = useState(false);
  const [startDate, setStartDate] = useState("2026-06-01");
  const [weightLog, setWeightLog] = useState([]);
  const [bodyComp, setBodyComp] = useState([]);
  const [training, setTraining] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await store.get("settings", { startDate: "2026-06-01" });
      setStartDate(s.startDate || "2026-06-01");
      setWeightLog(await store.get("weightLog", []));
      setBodyComp(await store.get("bodyComp", []));
      setTraining(await store.get("training", []));
      setSessions(await store.get("sessions", []));
      setLoaded(true);
    })();
  }, []);

  const saveWeight = (next) => { setWeightLog(next); store.set("weightLog", next); };
  const saveBody = (next) => { setBodyComp(next); store.set("bodyComp", next); };
  const saveTraining = (next) => { setTraining(next); store.set("training", next); };
  const saveSessions = (next) => { setSessions(next); store.set("sessions", next); };
  const saveStart = (d) => { setStartDate(d); store.set("settings", { startDate: d }); };

  const maLog = useMemo(() => withMA(weightLog), [weightLog]);
  const latestMA = maLog.length ? maLog[maLog.length - 1].ma : null;
  const days = daysBetween(startDate, todayStr());
  const phase = phaseFor(days < 0 ? 0 : days);
  const sortedBC = useMemo(
    () => [...bodyComp].sort((a, b) => a.date.localeCompare(b.date)), [bodyComp]);
  const latestBC = sortedBC[sortedBC.length - 1];
  const latestBF = latestBC ? (latestBC.weight - latestBC.lbm) / latestBC.weight : null;

  if (!loaded) return <div style={{ background: C.bg, color: C.muted, padding: 40, fontFamily: "monospace" }}>loading…</div>;

  const NAV = [
    { id: "dash", label: "ダッシュボード", icon: LayoutDashboard },
    { id: "plan", label: "プラン", icon: CalendarDays },
    { id: "weight", label: "体重", icon: Scale },
    { id: "body", label: "体組成", icon: Activity },
    { id: "train", label: "トレーニング", icon: Dumbbell },
  ];

  return (
    <div style={{ background: C.bg, color: C.ink, minHeight: 600, fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        .num{font-family:'Anton',sans-serif;letter-spacing:.5px;line-height:.9}
        .mono{font-family:'Space Mono',monospace}
        .rt-in{background:${C.panel2};border:1px solid ${C.line};color:${C.ink};border-radius:8px;padding:9px 11px;font-size:14px;outline:none;font-family:'Space Mono',monospace;width:100%}
        .rt-in:focus{border-color:${C.accent}}
        .rt-btn{background:${C.accent};color:#0d0e0c;border:none;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer;font-family:'Archivo',sans-serif;font-size:14px;transition:transform .08s}
        .rt-btn:active{transform:scale(.97)}
        .rt-ghost{background:transparent;color:${C.muted};border:1px solid ${C.line};border-radius:8px;padding:7px 12px;cursor:pointer;font-size:13px;font-family:'Archivo',sans-serif}
        .rt-ghost:hover{color:${C.ink};border-color:${C.muted}}
        .card{background:${C.panel};border:1px solid ${C.line};border-radius:14px;animation:rise .5s both}
        @keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        .row:hover{background:${C.panel2}}
        ::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-thumb{background:${C.line};border-radius:8px}
        select.rt-in{appearance:none}
      `}</style>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 22px 14px", borderBottom: `1px solid ${C.line}` }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 3, color: C.accent, fontWeight: 700 }}>RECOMP · 6 MONTH</div>
          <div className="num" style={{ fontSize: 30, marginTop: 2 }}>肉体改造ラボ</div>
        </div>
        <button className="rt-ghost" onClick={() => setShowSettings((s) => !s)} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Settings size={14} /> 設定
        </button>
      </div>

      {showSettings && (
        <div className="card" style={{ margin: "14px 22px 0", padding: 16, display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 12, color: C.muted }}>開始日</label>
            <input className="rt-in" type="date" value={startDate} onChange={(e) => saveStart(e.target.value)} style={{ width: 170, marginTop: 4 }} />
          </div>
          <button className="rt-ghost" style={{ color: C.danger, borderColor: C.danger }}
            onClick={() => { if (confirm("全データを消去する？")) { saveWeight([]); saveBody([]); saveTraining([]); } }}>
            全データ消去
          </button>
          <div style={{ fontSize: 12, color: C.muted, flex: 1, minWidth: 200 }}>
            入力したデータはこのアプリ内に保存され、次に開いたときも残る。
          </div>
        </div>
      )}

      {/* tabs */}
      <div style={{ display: "flex", gap: 4, padding: "14px 22px 0", flexWrap: "wrap" }}>
        {NAV.map((t) => {
          const on = tab === t.id; const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 10, cursor: "pointer",
                border: `1px solid ${on ? C.accent : C.line}`, background: on ? C.accent : "transparent",
                color: on ? "#0d0e0c" : C.muted, fontWeight: on ? 700 : 500, fontSize: 13, fontFamily: "'Archivo',sans-serif" }}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ padding: 22 }}>
        {tab === "dash" && <Dashboard {...{ latestMA, days, phase, maLog, latestBF, latestBC, sortedBC }} />}
        {tab === "plan" && <PlanView {...{ sessions, saveSessions }} />}
        {tab === "weight" && <WeightView {...{ maLog, weightLog, saveWeight }} />}
        {tab === "body" && <BodyView {...{ sortedBC, saveBody, startDate }} />}
        {tab === "train" && <TrainView {...{ training, saveTraining }} />}
      </div>
    </div>
  );
}

/* ---------- shared bits ---------- */
function Stat({ label, value, unit, sub, color }) {
  return (
    <div className="card" style={{ padding: "16px 18px", flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 11, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 6 }}>
        <span className="num" style={{ fontSize: 38, color: color || C.ink }}>{value}</span>
        {unit && <span className="mono" style={{ fontSize: 13, color: C.muted }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
const tip = { background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: "Space Mono", fontSize: 12, color: C.ink };

/* ---------- dashboard ---------- */
function Dashboard({ latestMA, days, phase, maLog, latestBF, latestBC, sortedBC }) {
  const gap = latestMA != null ? r1(latestMA - TARGET.weight) : null;
  const total = 182;
  const pct = Math.min(100, Math.max(0, (days / total) * 100));
  const chartData = maLog.map((e) => ({ date: e.date.slice(5), weight: e.weight, ma: e.ma }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Stat label="現在体重 (7日平均)" value={latestMA ?? "—"} unit="kg" color={C.accent}
          sub={gap != null ? `目標まで ${gap > 0 ? r1(gap) : 0} kg` : "体重を記録しよう"} />
        <Stat label="目標体重" value={TARGET.weight} unit="kg" sub={`除脂肪 ${TARGET.lbmReal}–${TARGET.lbmStretch}kg`} />
        <Stat label="現在 体脂肪率" value={latestBF != null ? r1(latestBF * 100) : "—"} unit="%"
          color={C.teal} sub={latestBC ? `除脂肪 ${latestBC.lbm}kg` : "体組成を記録しよう"} />
      </div>

      {/* phase bar */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Flame size={18} color={C.accent} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>フェーズ{PHASES.indexOf(phase) + 1}：{phase.name}</span>
            <span style={{ fontSize: 13, color: C.muted }}>{phase.sub}</span>
          </div>
          <span className="mono" style={{ fontSize: 13, color: C.muted }}>
            {days < 0 ? "開始前" : `Day ${days} / ${total}`}
          </span>
        </div>
        <div style={{ height: 8, background: C.panel2, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: C.accent, transition: "width .5s" }} />
        </div>
        {/* current macros */}
        <div style={{ display: "flex", gap: 18, marginTop: 16, flexWrap: "wrap" }}>
          {[["カロリー", phase.kcal, "kcal"], ["タンパク質", phase.p, "g"], ["脂質", phase.f, "g"], ["炭水化物", phase.c, "g"]].map(([l, v, u]) => (
            <div key={l}>
              <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1 }}>{l.toUpperCase()}</div>
              <div className="mono" style={{ fontSize: 16, color: C.ink, marginTop: 2 }}>{v} <span style={{ fontSize: 11, color: C.muted }}>{u}</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* weight trend */}
      <div className="card" style={{ padding: "18px 14px 10px" }}>
        <div style={{ fontWeight: 700, fontSize: 14, padding: "0 4px 10px", display: "flex", alignItems: "center", gap: 7 }}>
          <TrendingDown size={16} color={C.accent} /> 体重トレンド
        </div>
        {chartData.length === 0 ? (
          <Empty msg="体重を記録するとトレンドが出る" />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 11, fontFamily: "Space Mono" }} stroke={C.line} />
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fill: C.muted, fontSize: 11, fontFamily: "Space Mono" }} stroke={C.line} />
              <Tooltip contentStyle={tip} />
              <ReferenceLine y={TARGET.weight} stroke={C.teal} strokeDasharray="5 5"
                label={{ value: `目標 ${TARGET.weight}`, fill: C.teal, fontSize: 11, position: "insideTopRight" }} />
              <Scatter dataKey="weight" fill={C.muted} />
              <Line type="monotone" dataKey="ma" stroke={C.accent} strokeWidth={2.5} dot={false} name="7日平均" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function Empty({ msg }) {
  return <div style={{ padding: "32px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>{msg}</div>;
}

const kindColor = (k) => (k === "lift" ? C.accent : k === "cond" ? C.teal : C.muted);

/* ---------- plan + session view ---------- */
function PlanView({ sessions, saveSessions }) {
  const dow = new Date().getDay();
  const todayPlan = SCHEDULE.find((d) => d.dow === dow) || SCHEDULE[6];

  const [sd, setSd] = useState(todayStr());
  const [arrive, setArrive] = useState("");
  const [leave, setLeave] = useState("");
  const [cardio, setCardio] = useState("");
  const [kb, setKb] = useState("");
  const [note, setNote] = useState("");

  const gymMin = minutesBetween(arrive, leave);
  const save = () => {
    if (!arrive && !leave && !cardio && !kb) return;
    const entry = { id: uid(), date: sd, arrive, leave,
      cardio: parseInt(cardio) || 0, kb: parseInt(kb) || 0, note };
    saveSessions([...sessions.filter((s) => s.date !== sd), entry]);
    setArrive(""); setLeave(""); setCardio(""); setKb(""); setNote("");
  };
  const del = (id) => saveSessions(sessions.filter((s) => s.id !== id));
  const hist = [...sessions].sort((a, b) => b.date.localeCompare(a.date));

  const PlanItems = ({ items, accent }) => (
    <div>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
          padding: "8px 0", borderTop: i ? `1px solid ${C.line}` : "none" }}>
          <span style={{ fontSize: 14 }}>{it.n}</span>
          <span className="mono" style={{ fontSize: 14, color: accent, fontWeight: 700 }}>{it.s}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* today */}
      <div className="card" style={{ padding: 18, borderColor: kindColor(todayPlan.kind) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
          <ListChecks size={18} color={kindColor(todayPlan.kind)} />
          <span style={{ fontSize: 11, letterSpacing: 2, color: kindColor(todayPlan.kind), fontWeight: 700 }}>TODAY · {todayPlan.day}</span>
        </div>
        <div className="num" style={{ fontSize: 26, marginBottom: 10 }}>{todayPlan.title}</div>
        <PlanItems items={todayPlan.items} accent={kindColor(todayPlan.kind)} />
      </div>

      {/* session log */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, display: "flex", gap: 7, alignItems: "center" }}>
          <Clock size={16} color={C.accent} /> 今日のセッション記録
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 130 }}>
            <label style={{ fontSize: 12, color: C.muted }}>日付</label>
            <input className="rt-in" type="date" value={sd} onChange={(e) => setSd(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div style={{ width: 100 }}>
            <label style={{ fontSize: 12, color: C.muted }}>ジム着</label>
            <input className="rt-in" type="time" value={arrive} onChange={(e) => setArrive(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div style={{ width: 100 }}>
            <label style={{ fontSize: 12, color: C.muted }}>退出</label>
            <input className="rt-in" type="time" value={leave} onChange={(e) => setLeave(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div style={{ width: 92 }}>
            <label style={{ fontSize: 12, color: C.muted }}>有酸素(分)</label>
            <input className="rt-in" type="number" value={cardio} placeholder="20" onChange={(e) => setCardio(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div style={{ width: 100 }}>
            <label style={{ fontSize: 12, color: C.muted }}>ケトルベル(分)</label>
            <input className="rt-in" type="number" value={kb} placeholder="15" onChange={(e) => setKb(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ fontSize: 12, color: C.muted }}>メモ</label>
            <input className="rt-in" value={note} placeholder="調子・補足" onChange={(e) => setNote(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <button className="rt-btn" onClick={save} style={{ height: 38, display: "flex", gap: 6, alignItems: "center" }}><Plus size={16} /> 記録</button>
        </div>
        {gymMin != null && (
          <div style={{ marginTop: 10, fontSize: 13, color: C.muted }}>
            滞在時間 <span className="mono" style={{ color: C.accent }}>{fmtMin(gymMin)}</span>
          </div>
        )}
      </div>

      {/* week */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, display: "flex", gap: 7, alignItems: "center" }}>
          <CalendarDays size={16} color={C.teal} /> 週間プラン
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {SCHEDULE.map((d) => {
            const on = d.dow === dow;
            return (
              <div key={d.dow} style={{ paddingLeft: 12, borderLeft: `3px solid ${on ? kindColor(d.kind) : C.line}` }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 4 }}>
                  <span className="mono" style={{ fontSize: 13, color: on ? kindColor(d.kind) : C.muted, fontWeight: 700 }}>{d.day}</span>
                  <span style={{ fontSize: 14, fontWeight: on ? 700 : 500 }}>{d.title}</span>
                  {on && <span style={{ fontSize: 10, color: "#0d0e0c", background: kindColor(d.kind), padding: "1px 7px", borderRadius: 10, fontWeight: 700 }}>今日</span>}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px" }}>
                  {d.items.map((it, i) => (
                    <span key={i} style={{ fontSize: 12, color: C.muted }}>
                      {it.n} <span className="mono" style={{ color: on ? kindColor(d.kind) : C.ink }}>{it.s}</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 14 }}>※ レップ・セットはフェーズ1の出発点。トレ歴を聞いたら強度を詰める。</div>
      </div>

      {/* session history */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ fontWeight: 700, fontSize: 14, padding: "16px 16px 0", display: "flex", gap: 7, alignItems: "center" }}>
          <Footprints size={16} color={C.muted} /> 最近のセッション
        </div>
        {hist.length === 0 ? <Empty msg="ジムに着いたら時間とメニューを記録。" /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginTop: 10 }}>
            <thead>
              <tr style={{ color: C.muted, fontSize: 11, letterSpacing: 1 }}>
                {["日付", "ジム", "滞在", "有酸素", "ケトル"].map((h, i) => (
                  <th key={h} style={{ textAlign: i ? "right" : "left", padding: "10px 12px" }}>{h}</th>
                ))}
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {hist.map((s) => (
                <tr key={s.id} className="row" style={{ borderTop: `1px solid ${C.line}` }}>
                  <td className="mono" style={{ padding: "10px 12px" }}>{s.date}</td>
                  <td className="mono" style={{ textAlign: "right", padding: "10px 12px", color: C.muted }}>
                    {s.arrive || "—"}–{s.leave || "—"}
                  </td>
                  <td className="mono" style={{ textAlign: "right", padding: "10px 12px", color: C.accent }}>{fmtMin(minutesBetween(s.arrive, s.leave))}</td>
                  <td className="mono" style={{ textAlign: "right", padding: "10px 12px" }}>{s.cardio ? `${s.cardio}分` : "—"}</td>
                  <td className="mono" style={{ textAlign: "right", padding: "10px 12px", color: C.teal }}>{s.kb ? `${s.kb}分` : "—"}</td>
                  <td style={{ textAlign: "center" }}><Trash2 size={14} color={C.muted} style={{ cursor: "pointer" }} onClick={() => del(s.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ---------- weight view ---------- */
function WeightView({ maLog, weightLog, saveWeight }) {
  const [date, setDate] = useState(todayStr());
  const [w, setW] = useState("");
  const add = () => {
    const val = parseFloat(w);
    if (!val) return;
    const next = [...weightLog.filter((e) => e.date !== date), { id: uid(), date, weight: r1(val) }];
    saveWeight(next); setW("");
  };
  const del = (id) => saveWeight(weightLog.filter((e) => e.id !== id));
  const rows = [...maLog].reverse();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ padding: 16, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 130 }}>
          <label style={{ fontSize: 12, color: C.muted }}>日付</label>
          <input className="rt-in" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ marginTop: 4 }} />
        </div>
        <div style={{ flex: 1, minWidth: 110 }}>
          <label style={{ fontSize: 12, color: C.muted }}>体重 (kg)</label>
          <input className="rt-in" type="number" step="0.1" value={w} placeholder="73.5"
            onChange={(e) => setW(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} style={{ marginTop: 4 }} />
        </div>
        <button className="rt-btn" onClick={add} style={{ display: "flex", gap: 6, alignItems: "center", height: 38 }}>
          <Plus size={16} /> 記録
        </button>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        {rows.length === 0 ? <Empty msg="まだ記録がない。毎朝同じ条件で測ろう。" /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: C.muted, fontSize: 11, letterSpacing: 1 }}>
                <th style={{ textAlign: "left", padding: "12px 16px" }}>日付</th>
                <th style={{ textAlign: "right", padding: "12px 8px" }}>体重</th>
                <th style={{ textAlign: "right", padding: "12px 8px" }}>7日平均</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="row" style={{ borderTop: `1px solid ${C.line}` }}>
                  <td className="mono" style={{ padding: "11px 16px" }}>{e.date}</td>
                  <td className="mono" style={{ textAlign: "right", padding: "11px 8px" }}>{r1(e.weight)}</td>
                  <td className="mono" style={{ textAlign: "right", padding: "11px 8px", color: C.accent }}>{e.ma}</td>
                  <td style={{ textAlign: "center" }}>
                    <Trash2 size={14} color={C.muted} style={{ cursor: "pointer" }} onClick={() => del(e.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ---------- body composition view ---------- */
function BodyView({ sortedBC, saveBody, startDate }) {
  const [date, setDate] = useState(todayStr());
  const [w, setW] = useState(""); const [lbm, setLbm] = useState("");
  const add = () => {
    const wv = parseFloat(w), lv = parseFloat(lbm);
    if (!wv || !lv) return;
    const next = [...sortedBC.filter((e) => e.date !== date), { id: uid(), date, weight: r1(wv), lbm: r1(lv) }];
    saveBody(next); setW(""); setLbm("");
  };
  const del = (id) => saveBody(sortedBC.filter((e) => e.id !== id));

  // actual vs plan, indexed by month from start
  const chart = sortedBC.map((e) => {
    const mo = Math.round(daysBetween(startDate, e.date) / 30);
    const plan = PLAN.find((p) => p.m === mo);
    return { date: e.date.slice(5), 体重: e.weight, 除脂肪: e.lbm,
      計画体重: plan?.w ?? null, 計画除脂肪: plan?.lbm ?? null };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ padding: 16, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label style={{ fontSize: 12, color: C.muted }}>測定日</label>
          <input className="rt-in" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ marginTop: 4 }} />
        </div>
        <div style={{ flex: 1, minWidth: 90 }}>
          <label style={{ fontSize: 12, color: C.muted }}>体重</label>
          <input className="rt-in" type="number" step="0.1" value={w} placeholder="kg" onChange={(e) => setW(e.target.value)} style={{ marginTop: 4 }} />
        </div>
        <div style={{ flex: 1, minWidth: 90 }}>
          <label style={{ fontSize: 12, color: C.muted }}>除脂肪</label>
          <input className="rt-in" type="number" step="0.1" value={lbm} placeholder="kg" onChange={(e) => setLbm(e.target.value)} style={{ marginTop: 4 }} />
        </div>
        <button className="rt-btn" onClick={add} style={{ height: 38, display: "flex", gap: 6, alignItems: "center" }}><Plus size={16} /> 記録</button>
      </div>

      {chart.length > 0 && (
        <div className="card" style={{ padding: "18px 14px 10px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, padding: "0 4px 10px", display: "flex", gap: 7, alignItems: "center" }}>
            <Target size={16} color={C.teal} /> 実測 vs 計画
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chart} margin={{ top: 5, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 11, fontFamily: "Space Mono" }} stroke={C.line} />
              <YAxis tick={{ fill: C.muted, fontSize: 11, fontFamily: "Space Mono" }} stroke={C.line} />
              <Tooltip contentStyle={tip} />
              <Line type="monotone" dataKey="体重" stroke={C.accent} strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="計画体重" stroke={C.accent} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              <Line type="monotone" dataKey="除脂肪" stroke={C.teal} strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="計画除脂肪" stroke={C.teal} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card" style={{ overflow: "hidden" }}>
        {sortedBC.length === 0 ? <Empty msg="月1のInBody/DEXAで測ったら記録。実線=実測、点線=計画。" /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: C.muted, fontSize: 11, letterSpacing: 1 }}>
                {["測定日", "体重", "除脂肪", "脂肪", "体脂肪率"].map((h, i) => (
                  <th key={h} style={{ textAlign: i ? "right" : "left", padding: "12px 10px" }}>{h}</th>
                ))}
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {[...sortedBC].reverse().map((e) => {
                const fat = r1(e.weight - e.lbm); const bf = r1(((e.weight - e.lbm) / e.weight) * 100);
                return (
                  <tr key={e.id} className="row" style={{ borderTop: `1px solid ${C.line}` }}>
                    <td className="mono" style={{ padding: "11px 10px" }}>{e.date}</td>
                    <td className="mono" style={{ textAlign: "right", padding: "11px 10px" }}>{r1(e.weight)}</td>
                    <td className="mono" style={{ textAlign: "right", padding: "11px 10px", color: C.teal }}>{r1(e.lbm)}</td>
                    <td className="mono" style={{ textAlign: "right", padding: "11px 10px" }}>{fat}</td>
                    <td className="mono" style={{ textAlign: "right", padding: "11px 10px", color: C.accent }}>{bf}%</td>
                    <td style={{ textAlign: "center" }}><Trash2 size={14} color={C.muted} style={{ cursor: "pointer" }} onClick={() => del(e.id)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ---------- training view ---------- */
function TrainView({ training, saveTraining }) {
  const [date, setDate] = useState(todayStr());
  const [ex, setEx] = useState(LIFTS[0]);
  const [w, setW] = useState(""); const [reps, setReps] = useState(""); const [sets, setSets] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [imp, setImp] = useState(null);

  const add = () => {
    const wv = parseFloat(w), rv = parseInt(reps), sv = parseInt(sets) || 1;
    if (!wv || !rv) return;
    const next = [...training, { id: uid(), date, ex, weight: r1(wv), reps: rv, sets: sv }];
    saveTraining(next); setW(""); setReps("");
  };
  const del = (id) => saveTraining(training.filter((e) => e.id !== id));

  const importHevy = (file) => {
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const entries = parseHevyCSV(res.data);
        const sig = (e) => e.date + e.ex + e.weight + e.reps + e.sets;
        const seen = new Set(training.map(sig));
        const fresh = entries.filter((e) => !seen.has(sig(e)));
        saveTraining([...training, ...fresh]);
        setImp(fresh.length
          ? `${fresh.length}件インポート（重複${entries.length - fresh.length}件スキップ）`
          : "新規データなし（全部インポート済み）");
      },
      error: () => setImp("読み込み失敗。HevyのワークアウトCSVか確認して。"),
    });
  };

  const shown = training
    .filter((e) => filter === "ALL" || e.ex === filter)
    .sort((a, b) => b.date.localeCompare(a.date));

  // progression chart of estimated 1RM for the filtered exercise
  const prog = filter === "ALL" ? [] :
    training.filter((e) => e.ex === filter).sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({ date: e.date.slice(5), e1rm: est1RM(e.weight, e.reps) }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ padding: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label className="rt-ghost" style={{ display: "flex", gap: 7, alignItems: "center", cursor: "pointer" }}>
          <Upload size={15} /> HevyのCSVをインポート
          <input type="file" accept=".csv" style={{ display: "none" }}
            onChange={(e) => { importHevy(e.target.files[0]); e.target.value = ""; }} />
        </label>
        <span style={{ fontSize: 12, color: C.muted, flex: 1, minWidth: 170 }}>
          Hevy → プロフィール → 設定 → データのエクスポート → CSV
        </span>
        {imp && <span style={{ fontSize: 12, color: C.accent, display: "flex", gap: 5, alignItems: "center" }}><Check size={13} /> {imp}</span>}
      </div>

      <div className="card" style={{ padding: 16, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ minWidth: 130 }}>
          <label style={{ fontSize: 12, color: C.muted }}>日付</label>
          <input className="rt-in" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ marginTop: 4 }} />
        </div>
        <div style={{ minWidth: 150 }}>
          <label style={{ fontSize: 12, color: C.muted }}>種目</label>
          <select className="rt-in" value={ex} onChange={(e) => setEx(e.target.value)} style={{ marginTop: 4 }}>
            {LIFTS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div style={{ width: 80 }}>
          <label style={{ fontSize: 12, color: C.muted }}>重量</label>
          <input className="rt-in" type="number" step="0.5" value={w} placeholder="kg" onChange={(e) => setW(e.target.value)} style={{ marginTop: 4 }} />
        </div>
        <div style={{ width: 66 }}>
          <label style={{ fontSize: 12, color: C.muted }}>レップ</label>
          <input className="rt-in" type="number" value={reps} placeholder="8" onChange={(e) => setReps(e.target.value)} style={{ marginTop: 4 }} />
        </div>
        <div style={{ width: 66 }}>
          <label style={{ fontSize: 12, color: C.muted }}>セット</label>
          <input className="rt-in" type="number" value={sets} placeholder="3" onChange={(e) => setSets(e.target.value)} style={{ marginTop: 4 }} />
        </div>
        <button className="rt-btn" onClick={add} style={{ height: 38, display: "flex", gap: 6, alignItems: "center" }}><Plus size={16} /> 記録</button>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Chip on={filter === "ALL"} onClick={() => setFilter("ALL")}>すべて</Chip>
        {LIFTS.filter((l) => training.some((e) => e.ex === l)).map((l) => (
          <Chip key={l} on={filter === l} onClick={() => setFilter(l)}>{l}</Chip>
        ))}
      </div>

      {prog.length > 1 && (
        <div className="card" style={{ padding: "18px 14px 10px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, padding: "0 4px 10px" }}>{filter} · 推定1RMの推移</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={prog} margin={{ top: 5, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 11, fontFamily: "Space Mono" }} stroke={C.line} />
              <YAxis domain={["dataMin - 5", "dataMax + 5"]} tick={{ fill: C.muted, fontSize: 11, fontFamily: "Space Mono" }} stroke={C.line} />
              <Tooltip contentStyle={tip} />
              <Line type="monotone" dataKey="e1rm" stroke={C.accent} strokeWidth={2.5} dot={{ r: 3 }} name="推定1RM" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card" style={{ overflow: "hidden" }}>
        {shown.length === 0 ? <Empty msg="重量を伸ばし続けることが筋肉を守る信号。挙げたら記録。" /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: C.muted, fontSize: 11, letterSpacing: 1 }}>
                {["日付", "種目", "重量", "レップ", "セット", "推定1RM"].map((h, i) => (
                  <th key={h} style={{ textAlign: i < 2 ? "left" : "right", padding: "12px 10px" }}>{h}</th>
                ))}
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className="row" style={{ borderTop: `1px solid ${C.line}` }}>
                  <td className="mono" style={{ padding: "11px 10px" }}>{e.date}</td>
                  <td style={{ padding: "11px 10px" }}>{e.ex}</td>
                  <td className="mono" style={{ textAlign: "right", padding: "11px 10px" }}>{r1(e.weight)}</td>
                  <td className="mono" style={{ textAlign: "right", padding: "11px 10px" }}>{e.reps}</td>
                  <td className="mono" style={{ textAlign: "right", padding: "11px 10px" }}>{e.sets}</td>
                  <td className="mono" style={{ textAlign: "right", padding: "11px 10px", color: C.accent }}>{est1RM(e.weight, e.reps)}</td>
                  <td style={{ textAlign: "center" }}><Trash2 size={14} color={C.muted} style={{ cursor: "pointer" }} onClick={() => del(e.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding: "6px 12px", borderRadius: 20, cursor: "pointer", fontSize: 12,
      border: `1px solid ${on ? C.teal : C.line}`, background: on ? C.teal : "transparent",
      color: on ? "#0d0e0c" : C.muted, fontWeight: on ? 700 : 500, fontFamily: "'Archivo',sans-serif" }}>
      {children}
    </button>
  );
}
