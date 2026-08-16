const { chromium } = require("playwright");
const fs = require("fs");
const src = fs.readFileSync("/home/user/NIPORDER/src/lib/ublInvoice.js", "utf8").replace(/export function/g, "function");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>RK02026000000762</cbc:ID>
  <cbc:IssueDate>2026-07-16</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>TRY</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyName><cbc:Name>RUTIN KAHVE VE GIDA SANAYI TICARET LIMITED SIRKETI</cbc:Name></cac:PartyName>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="TRY">18281.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="KGM">10</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="TRY">10000.00</cbc:LineExtensionAmount>
    <cac:TaxTotal><cac:TaxSubtotal><cac:TaxCategory><cbc:Percent>1</cbc:Percent></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
    <cac:Item><cbc:Name>ESPRESSO LOT 02 BLEND</cbc:Name></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="TRY">1000.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:InvoiceLine>
    <cbc:ID>2</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">10</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="TRY">8100.00</cbc:LineExtensionAmount>
    <cac:AllowanceCharge>
      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
      <cbc:Amount currencyID="TRY">2025.00</cbc:Amount>
    </cac:AllowanceCharge>
    <cac:TaxTotal><cac:TaxSubtotal><cac:TaxCategory><cbc:Percent>10</cbc:Percent></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
    <cac:Item><cbc:Name>KOLOMBIYA CARAMBOLO 250 GR</cbc:Name></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="TRY">1012.50</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const out = await page.evaluate(([src, xml]) => {
    const R = [];
    const t = (ad, ok, d="") => R.push((ok ? "PASS  " : "FAIL  ") + ad + (d ? "  — " + d : ""));
    eval(src);
    const r = parseUblInvoice(xml);
    t("Tedarikci okundu", r.supplier_name.includes("RUTIN"), r.supplier_name);
    t("Tarih okundu", r.invoice_date === "2026-07-16", r.invoice_date);
    t("Fatura no okundu", r.invoice_no === "RK02026000000762", r.invoice_no);
    t("2 kalem bulundu", r.lines.length === 2, String(r.lines.length));
    const [a, b] = r.lines;
    t("kg birimi cevrildi", a.unit === "kg", a.unit);
    t("Birim maliyet KDV dahil (1000 x1.01 = 1010)", Math.abs(a.unit_cost - 1010) < 0.01, String(a.unit_cost));
    t("adet birimi cevrildi", b.unit === "adet", b.unit);
    t("ISKONTOLU maliyet dogru (810 x1.10 = 891)", Math.abs(b.unit_cost - 891) < 0.01, String(b.unit_cost));
    t("Iskonto %20 hesaplandi", Math.abs(b.discount_pct - 20) < 0.2, String(b.discount_pct));
    t("Liste fiyati korundu (1012.5)", Math.abs(b.list_unit_cost - 1012.5) < 0.01, String(b.list_unit_cost));
    t("KDV oranlari (1 / 10)", a.vat_pct === 1 && b.vat_pct === 10, a.vat_pct + "/" + b.vat_pct);
    t("Genel toplam okundu", r.grand_total === 18281, String(r.grand_total));
    let red = false; try { parseUblInvoice("<html><body>fatura degil</body></html>"); } catch { red = true; }
    t("Fatura olmayan dosya reddedildi", red);
    return R;
  }, [src, xml]);
  await browser.close();
  out.forEach(l => console.log(l));
  const fail = out.filter(l => l.startsWith("FAIL")).length;
  console.log(`\n${out.length - fail}/${out.length} test gecti`);
  process.exit(fail ? 1 : 0);
})();
