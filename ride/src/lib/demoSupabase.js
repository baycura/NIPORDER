// ============================================================
// Demo-mode Supabase stand-in.
// Activated ONLY when VITE_SUPABASE_URL / _ANON_KEY are missing
// (see supabase.js). In production with real keys this file is never used,
// so the real backend behaviour is unchanged.
//
// It implements just enough of the supabase-js surface that the ride app
// touches: a chainable query builder over in-memory tables, a fake signed-in
// staff session, and no-op auth/realtime. Lets us ship a fully browsable
// preview URL without exposing a real project.
// ============================================================

const DEMO_ADMIN_ID = "demo-admin-0000";
const uid = () => "demo-" + Math.random().toString(36).slice(2, 10);
const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// ---- Seed people (shared customers pool) ----
const customers = [
  { auth_user_id: DEMO_ADMIN_ID, email: "admin@notinparis.me", name: "NIP Ekip", avatar_url: null },
  { auth_user_id: "u-mert", email: "mert@example.com", name: "Mert Y.", avatar_url: null },
  { auth_user_id: "u-lina", email: "lina@example.com", name: "Lina K.", avatar_url: null },
  { auth_user_id: "u-deniz", email: "deniz@example.com", name: "Deniz A.", avatar_url: null },
];
const staff = [
  { auth_id: DEMO_ADMIN_ID, name: "NIP Ekip", role: "admin" },
];

// ---- Seed rides ----
const ride_posts = [
  { id: "r-social", user_id: DEMO_ADMIN_ID, is_official: true, title: "Cumartesi Social Ride", ride_date: daysFromNow(3), ride_time: "09:00", pace: "Sosyal · 22-25 km/s", distance_km: 45, elevation_m: 380, capacity: 30, meet_point: "Not In Paris", route_url: "https://www.komoot.com", strava_url: "https://strava.app.link/r7Vgs3may3b", notes: "Kahve molası dahil. Herkese açık tempo.", status: "open", created_at: new Date().toISOString() },
  { id: "r-gravel", user_id: "u-mert", is_official: false, title: "Belgrad Ormanı gravel", ride_date: daysFromNow(5), ride_time: "08:30", pace: "Orta · 25-28 km/s", distance_km: 60, elevation_m: 720, capacity: 8, meet_point: "Not In Paris", route_url: null, strava_url: null, notes: "Gravel/CX lastiği şart.", status: "open", created_at: new Date().toISOString() },
  { id: "r-dawn", user_id: "u-lina", is_official: false, title: "Şafak sürüşü — boğaz turu", ride_date: daysFromNow(1), ride_time: "06:00", pace: "Hızlı · 30+ km/s", distance_km: 38, elevation_m: 210, capacity: 6, meet_point: "Not In Paris", route_url: null, strava_url: null, notes: "Işıklar zorunlu.", status: "open", created_at: new Date().toISOString() },
];
const ride_rsvps = [
  { id: uid(), ride_id: "r-social", user_id: "u-mert", status: "going" },
  { id: uid(), ride_id: "r-social", user_id: "u-lina", status: "going" },
  { id: uid(), ride_id: "r-social", user_id: "u-deniz", status: "going" },
  { id: uid(), ride_id: "r-gravel", user_id: "u-lina", status: "going" },
];

// ---- Seed camps ----
const camps = [
  { id: "c-sahara", title: "Gates of Sahara", slug: "gates-of-sahara", location: "Fas / Morocco", start_date: daysFromNow(40), end_date: daysFromNow(47), summary: "7 gün çölün kapısında gravel.", description: "Atlas'tan çöle inen efsane rota. Destek aracı, konaklama ve yemek dahil. Orta-ileri seviye.", capacity: 12, price: 1450, currency: "EUR", cover_emoji: "🏜️", status: "open", created_at: new Date().toISOString() },
  { id: "c-alps", title: "Alpler Yüksek İrtifa Kampı", slug: "alps-climbing", location: "Fransız Alpleri", start_date: daysFromNow(75), end_date: daysFromNow(80), summary: "Efsane geçitler: Galibier, Izoard.", description: "Beş günde dört büyük geçit. Tırmanışa hazır olmalısın.", capacity: 10, price: 1180, currency: "EUR", cover_emoji: "🏔️", status: "open", created_at: new Date().toISOString() },
];
const camp_applications = [
  { id: uid(), camp_id: "c-sahara", user_id: "u-mert", full_name: "Mert Y.", phone: "+90 532 000 00 00", experience: "3 yıl gravel", notes: "Daha önce Kapadokya kampındaydım.", status: "pending", created_at: new Date().toISOString() },
  { id: uid(), camp_id: "c-sahara", user_id: "u-lina", full_name: "Lina K.", phone: "+90 533 111 11 11", experience: "Yol + gravel", notes: "", status: "accepted", created_at: new Date().toISOString() },
  { id: uid(), camp_id: "c-sahara", user_id: "u-deniz", full_name: "Deniz A.", phone: "+90 534 222 22 22", experience: "Başlangıç", notes: "Çöl şartlarını merak ediyorum.", status: "waitlist", created_at: new Date().toISOString() },
];

// ---- Seed rentals ----
const bike_rentals = [
  { id: "b-canyon", owner_id: "u-mert", brand_model: "Canyon Ultimate CF SL 8", bike_type: "yol", frame_material: "karbon", frame_size: "M (54)", groupset: "Shimano 105 Di2", gearing: "50/34 · 11-34", tire_size: "700x28c", brake_type: "disk", location: "Kadıköy", price: 35, price_period: "day", currency: "EUR", phone: "+90 532 000 00 00", notes: "Pedal ve kask dahil.", status: "available", created_at: new Date().toISOString() },
  { id: "b-3t", owner_id: "u-lina", brand_model: "3T Exploro RaceMax", bike_type: "gravel", frame_material: "karbon", frame_size: "54", groupset: "SRAM Rival AXS", gearing: "40T · 10-44", tire_size: "700x40c", brake_type: "disk", location: "Beşiktaş", price: 160, price_period: "week", currency: "EUR", phone: "+90 533 111 11 11", notes: "Bikepacking çantaları opsiyonel.", status: "available", created_at: new Date().toISOString() },
];

const DB = { ride_posts, ride_rsvps, camps, camp_applications, bike_rentals, customers, staff };

// ---- Derived views ----
function rideBoard() {
  return ride_posts.map((p) => {
    const going = ride_rsvps.filter((r) => r.ride_id === p.id && r.status === "going").length;
    return { ...p, going_count: going, seats_open: Math.max(p.capacity - going, 0) };
  });
}
function campBoard() {
  return camps.map((c) => {
    const accepted = camp_applications.filter((a) => a.camp_id === c.id && a.status === "accepted").length;
    return { ...c, accepted_count: accepted, spots_open: Math.max(c.capacity - accepted, 0) };
  });
}
function bikeRentalsPublic() {
  return bike_rentals.filter((b) => b.status !== "hidden").map(({ price, phone, price_period, currency, ...rest }) => rest);
}
function rowsFor(table) {
  if (table === "ride_board") return rideBoard();
  if (table === "camp_board") return campBoard();
  if (table === "bike_rentals_public") return bikeRentalsPublic();
  return DB[table] || [];
}
function baseTable(table) {
  if (table === "ride_board") return "ride_posts";
  if (table === "camp_board") return "camps";
  if (table === "bike_rentals_public") return "bike_rentals";
  return table;
}

// ---- Chainable, awaitable query builder ----
class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this._order = null;
    this._mutation = null; // {type, payload}
  }
  select() { return this; }
  insert(payload) { this._mutation = { type: "insert", payload }; return this; }
  update(payload) { this._mutation = { type: "update", payload }; return this; }
  upsert(payload) { this._mutation = { type: "upsert", payload }; return this; }
  delete() { this._mutation = { type: "delete" }; return this; }
  eq(col, val) { this.filters.push((r) => r[col] === val); this._eq = { col, val }; return this; }
  neq(col, val) { this.filters.push((r) => r[col] !== val); return this; }
  in(col, vals) { this.filters.push((r) => vals.includes(r[col])); return this; }
  gte(col, val) { this.filters.push((r) => r[col] >= val); return this; }
  lte(col, val) { this.filters.push((r) => r[col] <= val); return this; }
  gt(col, val) { this.filters.push((r) => r[col] > val); return this; }
  lt(col, val) { this.filters.push((r) => r[col] < val); return this; }
  order(col, opts = {}) { this._order = { col, asc: opts.ascending !== false }; return this; }
  _apply(rows) {
    let out = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this._order) {
      const { col, asc } = this._order;
      out = [...out].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
    }
    return out;
  }
  _runMutation() {
    const base = baseTable(this.table);
    const arr = DB[base];
    const m = this._mutation;
    if (m.type === "insert") {
      const items = (Array.isArray(m.payload) ? m.payload : [m.payload]).map((x) => ({ id: uid(), created_at: new Date().toISOString(), ...x }));
      arr.push(...items);
      return items;
    }
    if (m.type === "upsert") {
      const items = Array.isArray(m.payload) ? m.payload : [m.payload];
      items.forEach((x) => {
        const i = arr.findIndex((r) => (this._eq && r[this._eq.col] === this._eq.val) || (x.id && r.id === x.id));
        if (i >= 0) arr[i] = { ...arr[i], ...x };
        else arr.push({ id: uid(), created_at: new Date().toISOString(), ...x });
      });
      return items;
    }
    if (m.type === "update") {
      const hit = this._apply(arr);
      hit.forEach((r) => Object.assign(r, m.payload));
      return hit;
    }
    if (m.type === "delete") {
      const hit = this._apply(arr);
      hit.forEach((r) => { const i = arr.indexOf(r); if (i >= 0) arr.splice(i, 1); });
      return hit;
    }
  }
  _resolve() {
    if (this._mutation) {
      try { this._lastRows = this._runMutation(); } catch (e) { return { data: null, error: { message: String(e) } }; }
      return { data: this._lastRows, error: null };
    }
    return { data: this._apply(rowsFor(this.table)), error: null };
  }
  maybeSingle() {
    const { data, error } = this._resolve();
    return Promise.resolve({ data: (data && data[0]) || null, error });
  }
  single() {
    const { data, error } = this._resolve();
    return Promise.resolve({ data: (data && data[0]) || null, error });
  }
  then(onF, onR) { return Promise.resolve(this._resolve()).then(onF, onR); }
}

// ---- Fake signed-in staff session ----
const demoUser = { id: DEMO_ADMIN_ID, email: "admin@notinparis.me", user_metadata: { full_name: "NIP Ekip" } };
const demoSession = { user: demoUser };

export const demoSupabase = {
  __demo: true,
  from(table) { return new Query(table); },
  auth: {
    getSession: async () => ({ data: { session: demoSession } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithOAuth: async () => ({ data: {}, error: null }),
    signInWithOtp: async () => ({ data: {}, error: null }),
    signOut: async () => ({ error: null }),
  },
  channel() {
    const ch = { on() { return ch; }, subscribe() { return ch; } };
    return ch;
  },
  removeChannel() {},
};
