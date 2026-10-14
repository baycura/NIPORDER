// KISA UYARI SESI — Web Audio ile uretilir; ses dosyasi ve ag istegi yok.
//
// Tarayici sesi ancak ekrana bir dokunustan sonra acar (otomatik oynatma
// kurali). sesHazirla() her dokunusta cagrilir; ilk dokunustan once gelen
// uyari sessiz kalir, ekrandaki serit yine gorunur.
let ctx = null;

export function sesHazirla() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return true;
  } catch {
    return false;
  }
}

// Iki kez "ding-dong". Kafe muziginin icinde duyulsun diye ucgen dalga;
// mutfak alarmindan (KitchenPage, kare dalga) daha yumusak. Ses motoru
// uyanik degilse calmaz: zamanlanan notalar sonradan topluca calmasin.
export function qrZilCal() {
  if (!sesHazirla() || ctx.state !== "running") return false;
  const nota = (frekans, bas, sure) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = frekans;
    o.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime + bas;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    o.start(t);
    o.stop(t + sure + 0.02);
  };
  nota(988, 0, 0.35);
  nota(1319, 0.22, 0.45);
  nota(988, 0.75, 0.35);
  nota(1319, 0.97, 0.5);
  return true;
}
