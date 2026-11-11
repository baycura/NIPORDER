import { useEffect, useState } from "react";
import Bildirim from "./Bildirim.jsx";
import { uyarDinle } from "../lib/uyar.js";

// lib/uyar.js'in tek yuvasi. StaffLayout'ta bir kez cizilir; sayfa degisse de
// yerinde kalir. Ustte durur: alt cubuktaki Kart / Nakit dugmelerini ortmez,
// pencerelerin de ustunde gorunur (Bildirim zIndex 300).
export default function UyariYuvasi() {
  const [ileti, setIleti] = useState(null);
  useEffect(() => uyarDinle(setIleti), []);
  if (!ileti) return null;
  // Uzun yazi daha uzun kalir: okunmadan kaybolmasin.
  const sure = Math.min(12000, Math.max(ileti.tur === "hata" ? 6000 : 3500, 2500 + ileti.metin.length * 55));
  return <Bildirim key={ileti.n} metin={ileti.metin} tur={ileti.tur} konum="ust" sure={sure} />;
}
