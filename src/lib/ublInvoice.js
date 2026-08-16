// e-Fatura (UBL-TR) XML cozumleyici.
//
// Neden: fotograftan OCR tahmin yapar — iskonto, koli adedi, KDV satirlari
// yanlis okunabilir (Uludag faturasindaki iskonto hatasi boyle olmustu).
// XML'de bu bilgiler zaten YAZILI: miktar, birim fiyat, iskonto ve KDV kalem
// kalem gelir. TURMOB Luca e-Belge portalindan indirilen XML'ler bu formattadir.
//
// Cikti, invoice-ocr fonksiyonunun dondugu yapiyla ayni tutulur ki fatura
// ekrani iki kaynagi da ayni sekilde islesin.

// UBL birim kodlari -> uygulamadaki birimler
const UNIT_CODE = {
  C62: "adet", H87: "adet", EA: "adet", NIU: "adet", PCE: "adet",
  KGM: "kg", GRM: "g", LTR: "l", MLT: "ml", CLT: "cl",
  BX: "adet", PK: "adet", CT: "adet", PA: "adet", // koli/paket: adet sayilir
};

const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

// Namespace'ten bagimsiz okuma: e-Fatura dosyalari farkli onek kullanabilir
const pick = (node, localName) => {
  if (!node) return null;
  for (const el of node.getElementsByTagName("*")) {
    if (el.localName === localName) return el;
  }
  return null;
};
const pickAll = (node, localName) => {
  const out = [];
  if (!node) return out;
  for (const el of node.getElementsByTagName("*")) {
    if (el.localName === localName) out.push(el);
  }
  return out;
};
const text = (node, localName) => {
  const el = pick(node, localName);
  return el ? (el.textContent || "").trim() : "";
};
// Dogrudan cocuk arar — ic ice ayni adli etiketlerde karismasin diye
const childAll = (node, localName) =>
  Array.from(node?.children || []).filter(el => el.localName === localName);
const child = (node, localName) => childAll(node, localName)[0] || null;

/**
 * @param {string} xmlText  e-Fatura XML icerigi
 * @returns {{supplier_name:string, invoice_date:string, invoice_no:string,
 *            currency:string, grand_total:number, lines:Array}}
 */
export function parseUblInvoice(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (pick(doc, "parsererror")) throw new Error("XML okunamadi — dosya bozuk olabilir");

  const root = doc.documentElement;
  if (!root || !/invoice/i.test(root.localName)) {
    throw new Error("Bu dosya bir e-Fatura (UBL) XML'i degil");
  }

  // Tedarikci: AccountingSupplierParty > Party > PartyName > Name
  const supplierParty = pick(doc, "AccountingSupplierParty");
  const supplier =
    text(pick(supplierParty, "PartyName"), "Name") ||
    text(pick(supplierParty, "Person"), "FirstName") ||
    "";

  const issueDate = text(root, "IssueDate"); // zaten YYYY-MM-DD
  const invoiceNo = text(root, "ID");
  const currency = root.getAttribute("currencyID") ||
    text(root, "DocumentCurrencyCode") || "TRY";

  const legalTotal = pick(doc, "LegalMonetaryTotal");
  const grandTotal = num(text(legalTotal, "PayableAmount"));

  const lines = pickAll(doc, "InvoiceLine").map((ln) => {
    const item = child(ln, "Item") || pick(ln, "Item");
    const name = text(item, "Name") || text(item, "Description") || "";

    const qtyEl = child(ln, "InvoicedQuantity");
    const qty = num(qtyEl?.textContent);
    const unitCode = (qtyEl?.getAttribute("unitCode") || "").toUpperCase();

    // Kalem tutari (iskonto DUSULMUS, KDV haric)
    const lineAmount = num(text(ln, "LineExtensionAmount"));

    // Liste birim fiyati (iskonto oncesi)
    const priceEl = child(ln, "Price");
    const listUnit = num(text(priceEl, "PriceAmount"));

    // Iskonto: ChargeIndicator=false olan AllowanceCharge satirlari
    let discount = 0;
    for (const ac of childAll(ln, "AllowanceCharge")) {
      if ((text(ac, "ChargeIndicator") || "").toLowerCase() === "false") {
        discount += num(text(ac, "Amount"));
      }
    }

    // KDV orani
    const taxSub = pick(child(ln, "TaxTotal") || ln, "TaxSubtotal");
    const vatPct = num(text(pick(taxSub, "TaxCategory") || taxSub, "Percent"));

    // Birim maliyet KDV DAHIL — uygulamanin her yerinde boyle tutuluyor
    const netUnit = qty > 0 ? lineAmount / qty : 0;
    const unitCost = Math.round(netUnit * (1 + vatPct / 100) * 10000) / 10000;

    const discountPct = (listUnit > 0 && qty > 0)
      ? Math.round((1 - (lineAmount / qty) / listUnit) * 1000) / 10
      : 0;

    return {
      name,
      qty,
      unit: UNIT_CODE[unitCode] || "adet",
      unit_cost: unitCost,
      list_unit_cost: listUnit,
      discount_pct: discountPct > 0.1 ? discountPct : 0,
      vat_pct: vatPct,
      line_total: lineAmount,
      pack_type: "adet",
      pack_qty: 1,
      content_cl: 0,
    };
  }).filter(l => l.name && l.qty > 0);

  return {
    supplier_name: supplier,
    invoice_date: /^\d{4}-\d{2}-\d{2}/.test(issueDate) ? issueDate.slice(0, 10) : "",
    invoice_no: invoiceNo,
    currency,
    grand_total: grandTotal,
    lines,
  };
}
