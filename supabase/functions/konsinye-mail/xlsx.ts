// Kucuk XLSX yazici (stil destekli).
//
// Tedarikci satis raporu icin yeterli: tek sayfa, satir ici metin, sayi,
// formul (onbellekli degerle — Gmail/telefon onizlemesi formul hesaplamaz,
// onbellek yoksa 0 gosterir), hucre stilleri, sutun genisligi, yatay sayfa,
// kilavuz cizgisiz. SheetJS'in ucretsiz surumu stil yazamadigi icin kendimiz
// yaziyoruz; fflate yalniz zip icin. Excel acilista yeniden hesaplar
// (calcPr fullCalcOnLoad).
import { strToU8, zipSync } from "npm:fflate@0.8.2";

export type Hucre = { v?: string | number | null; f?: string; s?: number };
export type Satir = { h?: (Hucre | null | undefined)[]; yuk?: number };
export interface Sayfa { ad: string; genislik: number[]; satirlar: Satir[] }

export const TL = '#,##0" ₺";-#,##0" ₺";"-"';

// XML 1.0'da gecersiz kontrol karakterleri atilir (yapistirilan metinde dikey
// sekme olur; tek karakter dosyayi acilmaz yapar).
const esc = (s: string) =>
  String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// 0 -> A, 25 -> Z, 26 -> AA
export const kol = (n: number): string => {
  let s = "";
  n += 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

// Stil indeksleri (cellXfs sirasi). rapor.ts bunlari kullanir.
export const S = {
  duz: 0, baslik: 1, altBaslik: 2, gri: 3, kolonBaslik: 4,
  metin: 5, tl: 6, orta: 7,
  toplamMetin: 8, toplamTl: 9, toplamOrta: 10,
  odenecekEtiket: 11, odenecekTl: 12, not: 13, odendiNot: 14, odendiTl: 15,
  barkod: 16, oranMavi: 17, oran: 18, kalin: 19, oranEksik: 20,
} as const;

const F = "Arial";
const font = (sz: number, o: { b?: boolean; c?: string } = {}) =>
  `<font>${o.b ? "<b/>" : ""}<sz val="${sz}"/>${o.c ? `<color rgb="FF${o.c}"/>` : ""}<name val="${F}"/></font>`;
const dolgu = (rgb: string) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="${esc(TL)}"/><numFmt numFmtId="165" formatCode="0%"/></numFmts>
<fonts count="10">${[
  font(9), font(9, { b: true }), font(14, { b: true }), font(11, { b: true }), font(8, { c: "666666" }),
  font(9, { b: true, c: "FFFFFF" }), font(9, { c: "0000FF" }), font(12, { b: true }), font(9, { c: "C87A6A" }), font(10, { b: true }),
].join("")}</fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${dolgu("222222")}${dolgu("F2F2F2")}${dolgu("FFFF00")}</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBBBBBB"/></left><right style="thin"><color rgb="FFBBBBBB"/></right><top style="thin"><color rgb="FFBBBBBB"/></top><bottom style="thin"><color rgb="FFBBBBBB"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="21">${[
  /* 0 duz */ `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`,
  /* 1 baslik */ `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
  /* 2 altBaslik */ `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
  /* 3 gri */ `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
  /* 4 kolonBaslik */ `<xf numFmtId="0" fontId="5" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`,
  /* 5 metin */ `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>`,
  /* 6 tl */ `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>`,
  /* 7 orta */ `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`,
  /* 8 toplamMetin */ `<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>`,
  /* 9 toplamTl */ `<xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>`,
  /* 10 toplamOrta */ `<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`,
  /* 11 odenecekEtiket */ `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
  /* 12 odenecekTl */ `<xf numFmtId="164" fontId="7" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>`,
  /* 13 not */ `<xf numFmtId="0" fontId="8" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
  /* 14 odendiNot */ `<xf numFmtId="0" fontId="9" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
  /* 15 odendiTl */ `<xf numFmtId="164" fontId="3" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>`,
  /* 16 barkod */ `<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>`,
  /* 17 oranMavi */ `<xf numFmtId="165" fontId="6" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>`,
  /* 18 oran */ `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`,
  /* 19 kalin */ `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
  /* 20 oranEksik */ `<xf numFmtId="165" fontId="6" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>`,
].join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function hucreXml(ref: string, c: Hucre): string {
  const s = c.s ? ` s="${c.s}"` : "";
  if (c.f) {
    const metin = typeof c.v === "string";
    const v = c.v == null ? "" : `<v>${metin ? esc(String(c.v)) : c.v}</v>`;
    return `<c r="${ref}"${s}${metin ? ` t="str"` : ""}><f>${esc(c.f)}</f>${v}</c>`;
  }
  if (typeof c.v === "number") return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
  if (c.v == null || c.v === "") return c.s ? `<c r="${ref}"${s}/>` : "";
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(c.v))}</t></is></c>`;
}

export function xlsxYap(sayfa: Sayfa): Uint8Array {
  const satirlar = sayfa.satirlar.map((r, ri) => {
    const hucreler = (r.h || []).map((c, ci) => (c ? hucreXml(kol(ci) + (ri + 1), c) : "")).join("");
    const ht = r.yuk ? ` ht="${r.yuk}" customHeight="1"` : "";
    return `<row r="${ri + 1}"${ht}>${hucreler}</row>`;
  }).join("");
  const cols = sayfa.genislik.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="13"/><cols>${cols}</cols><sheetData>${satirlar}</sheetData><pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="1"/></worksheet>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sayfa.ad.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets><calcPr fullCalcOnLoad="1"/></workbook>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rels),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(wbRels),
    "xl/styles.xml": strToU8(STYLES),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  }, { level: 6 });
}
