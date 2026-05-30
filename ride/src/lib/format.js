// Small display helpers shared across ride pages.

const DAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

// ride_date is a 'YYYY-MM-DD' string -> parse as local date (no TZ shift).
export function parseRideDate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function fmtDate(s) {
  const d = parseRideDate(s);
  if (!d) return "";
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isPast(s) {
  return parseRideDate(s) < parseRideDate(todayStr());
}

export const STATUS_LABEL = { open: "AÇIK", full: "DOLU", cancelled: "İPTAL" };

export const PACE_OPTIONS = [
  "Sosyal / Keyif",
  "Tempo",
  "Hızlı",
  "Yarış temposu",
];

// Every Ride Buddy ride starts from the café.
export const START_POINT = "Not In Paris";

// Official "Social Ride" branding + default Strava club for the join CTA.
export const OFFICIAL_HOST = "Not In Paris";
export const STRAVA_CLUB_URL = "https://www.strava.com/clubs/notinparis";
