import { useState } from "react";

const API = "http://localhost:8000";

const STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana",
  "Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur",
  "Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana",
  "Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Andaman & Nicobar Islands","Chandigarh",
  "Dadra & Nagar Haveli and Daman & Diu","Delhi","Jammu & Kashmir","Ladakh","Lakshadweep","Puducherry",
];

const OCCUPATIONS = [
  ["student", "Student"], ["farmer", "Farmer"], ["labourer", "Labourer / daily wage"],
  ["street_vendor", "Street vendor"], ["artisan", "Artisan / craftsperson"],
  ["business", "Small business owner"], ["unemployed", "Unemployed / job seeker"],
  ["homemaker", "Homemaker"], ["salaried", "Salaried employee"], ["other", "Other"],
];

const CATEGORIES = ["General", "OBC", "SC", "ST", "EWS"];

const EXAMPLES = [
  "I need financial help for my college education",
  "I am a farmer and want crop protection and credit",
  "I want to start a small business but have no collateral",
  "Health insurance for my elderly parents",
];

const STATUS = {
  match: { label: "Strong match", cls: "ok" },
  likely: { label: "Possible match", cls: "maybe" },
  gap: { label: "Eligibility gap", cls: "gap" },
};

function SchemeCard({ r }) {
  const [open, setOpen] = useState(false);
  const st = STATUS[r.status];
  return (
    <article className="card scheme">
      <div className="scheme-head">
        <div>
          <span className="tag">{r.category}</span>
          <h3>{r.name}</h3>
          <p className="muted">{r.ministry}</p>
        </div>
        <span className={`badge ${st.cls}`}>{st.label}</span>
      </div>

      <p className="benefit"><strong>Benefit:</strong> {r.benefits}</p>

      <div className="meter" title="Semantic relevance to your request">
        <span>Relevance</span>
        <div className="bar"><div style={{ width: `${r.relevance}%` }} /></div>
        <span>{r.relevance}%</span>
      </div>

      <ul className="checks">
        {r.met.map((t, i) => <li key={"m" + i} className="c-ok">✓ {t}</li>)}
        {r.gaps.map((t, i) => <li key={"g" + i} className="c-gap">✕ {t}</li>)}
        {r.unknown.map((t, i) => <li key={"u" + i} className="c-unk">? {t}</li>)}
      </ul>

      <button className="link-btn" onClick={() => setOpen(!open)}>
        {open ? "Hide details ▲" : "Documents & how to apply ▼"}
      </button>

      {open && (
        <div className="details">
          <h4>Who it's for</h4>
          <p>{r.target_group}</p>
          {r.notes && (<><h4>Good to know</h4><p>{r.notes}</p></>)}
          <h4>Documents to keep ready</h4>
          <div className="chips">
            {r.documents.map((d) => <span key={d} className="chip">{d}</span>)}
          </div>
          <h4>How to apply</h4>
          <p>{r.how_to_apply}</p>
        </div>
      )}

      <a className="cta" href={r.url} target="_blank" rel="noreferrer">
        Open official page ↗
      </a>
    </article>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState({
    age: "", annual_income: "", state: "", gender: "",
    occupation: "", category: "", residence: "",
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("match");

  const field = (k) => (e) => setProfile({ ...profile, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const body = {
      query,
      profile: {
        age: profile.age ? Number(profile.age) : null,
        annual_income: profile.annual_income ? Number(profile.annual_income) : null,
        state: profile.state || null,
        gender: profile.gender || null,
        occupation: profile.occupation || null,
        category: profile.category || null,
        residence: profile.residence || null,
      },
    };
    try {
      const res = await fetch(`${API}/api/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Server error");
      setData(await res.json());
      setTab("match");
    } catch (err) {
      setError("Could not reach the backend. Make sure it is running on port 8000.");
    } finally {
      setLoading(false);
    }
  }

  const matches = data ? data.results.filter((r) => r.status !== "gap") : [];
  const close = data ? data.results.filter((r) => r.status === "gap") : [];
  const shown = tab === "match" ? matches : close;

  return (
    <div className="page">
      <header className="hero">
        <span className="pill">AI-powered · Free to use</span>
        <h1>Find the benefits <span>made for you</span></h1>
        <p>Tell us about yourself and what you need in your own words. We match you with
          government schemes and explain exactly why you qualify, or what's missing.</p>
      </header>

      <main className="layout">
        <form className="card form" onSubmit={submit}>
          <h2>Your details</h2>

          <label>What do you need help with?
            <textarea rows={3} value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. I need financial help for my college education" />
          </label>
          <div className="chips">
            {EXAMPLES.map((ex) => (
              <button type="button" key={ex} className="chip clickable" onClick={() => setQuery(ex)}>
                {ex}
              </button>
            ))}
          </div>

          <div className="grid2">
            <label>Age
              <input type="number" min="0" max="120" value={profile.age} onChange={field("age")} placeholder="21" />
            </label>
            <label>Annual family income (₹)
              <input type="number" min="0" value={profile.annual_income} onChange={field("annual_income")} placeholder="200000" />
            </label>
            <label>State / UT
              <select value={profile.state} onChange={field("state")}>
                <option value="">Select</option>
                {STATES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label>Gender
              <select value={profile.gender} onChange={field("gender")}>
                <option value="">Select</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>Occupation
              <select value={profile.occupation} onChange={field("occupation")}>
                <option value="">Select</option>
                {OCCUPATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label>Social category
              <select value={profile.category} onChange={field("category")}>
                <option value="">Select</option>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>Area you live in
              <select value={profile.residence} onChange={field("residence")}>
                <option value="">Select</option>
                <option value="rural">Rural</option>
                <option value="urban">Urban</option>
              </select>
            </label>
          </div>

          <button className="primary" disabled={loading}>
            {loading ? "Finding schemes…" : "Find my schemes →"}
          </button>
          <p className="fine">Your details are only used to match schemes. Always verify on the official page.</p>
        </form>

        <section className="results">
          {error && <div className="card error">{error}</div>}

          {!data && !loading && !error && (
            <div className="card empty">
              <div className="emoji">🧭</div>
              <h3>Your matches will appear here</h3>
              <p className="muted">Fill in your details on the left and press “Find my schemes”.</p>
            </div>
          )}

          {loading && [1, 2, 3].map((i) => <div key={i} className="card skeleton" />)}

          {data && !loading && (
            <>
              <div className="card summary">
                <h3>✨ AI summary</h3>
                <p>{data.summary}</p>
              </div>

              <div className="tabs">
                <button className={tab === "match" ? "active" : ""} onClick={() => setTab("match")}>
                  Matches ({matches.length})
                </button>
                <button className={tab === "gap" ? "active" : ""} onClick={() => setTab("gap")}>
                  Close, with gaps ({close.length})
                </button>
              </div>

              {shown.length === 0 && <div className="card empty"><p className="muted">Nothing in this tab yet.</p></div>}
              {shown.map((r) => <SchemeCard key={r.id} r={r} />)}
            </>
          )}
        </section>
      </main>

      <footer>Built with NLP · Sentence embeddings · RAG · FastAPI · React</footer>
    </div>
  );
}