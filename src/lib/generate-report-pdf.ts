import {
  ensureUrduFontLoaded,
  hasUrdu,
  renderMultilineTextToImageDataUrl,
  createTableUrduCellMap,
  getAutoTableUrduHooks,
  type RenderedTextImage,
} from "@/lib/pdf-urdu";
import { numberToRupeeWords } from "@/lib/number-to-words";

/* ─── Farm branding constants ─── */
const FARM_NAME = "DANISH CATTLE FEED";
const FARM_TAGLINE = "Cattle Feed Supplier";
const FARM_ADDRESS = "Farm: Dry port phatak Faisalabad";
const SHOP_ADDRESS = "Shop: Madni kholoni shamsabad jhumra road";
const FARM_PHONE = "0300-3966715";

/* Color palette */
const C_GREEN: [number, number, number] = [8, 80, 57];
const C_GREEN_LIGHT: [number, number, number] = [240, 244, 240];
const C_GOLD: [number, number, number] = [245, 196, 56];
const C_GOLD_LIGHT: [number, number, number] = [252, 247, 232];
const C_DARK: [number, number, number] = [23, 51, 55];
const C_MUTED_GRAY: [number, number, number] = [85, 85, 85];
const C_GRAY: [number, number, number] = [107, 124, 127];
const C_GRAY_LIGHT: [number, number, number] = [220, 229, 229];
const C_WHITE: [number, number, number] = [255, 255, 255];

function formatRs(n?: number | null): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "0";
  return Number(n).toLocaleString("en-PK");
}

function toTitleCase(str?: string | null): string {
  if (!str) return "";
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
}

/** Draw Standard Header on jsPDF instance */
function drawReportHeader(
  doc: any,
  pw: number,
  m: number,
  reportTitle: string,
  subtitle: string,
  metadataRight: { label: string; value: string }[]
): number {
  const headerH = 38;

  // Gold top line
  doc.setFillColor(...C_GOLD);
  doc.rect(0, 0, pw, 2.5, "F");

  // Farm Title & Tagline
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...C_GREEN);
  doc.text(FARM_NAME, m, 12);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...C_GRAY);
  doc.text(FARM_TAGLINE, m, 17);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text(`${FARM_ADDRESS} | ${SHOP_ADDRESS}`, m, 22);
  doc.text(`Phone: ${FARM_PHONE}`, m, 26);

  // Right side: Report Title & Metadata
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...C_GREEN);
  doc.text(reportTitle.toUpperCase(), pw - m, 12, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_GRAY);
  doc.text(subtitle, pw - m, 17, { align: "right" });

  let metaY = 22;
  for (const meta of metadataRight) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    doc.setTextColor(...C_DARK);
    doc.text(`${meta.label}: `, pw - m - 35, metaY, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C_MUTED_GRAY);
    doc.text(meta.value, pw - m, metaY, { align: "right" });
    metaY += 4;
  }

  // Divider line
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.8);
  doc.line(m, headerH, pw - m, headerH);
  doc.setLineWidth(0.2);
  doc.setDrawColor(...C_GREEN);
  doc.line(m, headerH + 1, pw - m, headerH + 1);

  return headerH + 6;
}

/** Draw Standard Supervisor Verification & Stamp Footer */
function drawSupervisorFooter(doc: any, pw: number, ph: number, m: number, currentY: number): number {
  let sigY = Math.max(currentY + 16, ph - 38);
  if (sigY > ph - 30) {
    doc.addPage();
    sigY = ph - 38;
  }

  // Stamp circle on left
  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.5);
  doc.circle(m + 16, sigY + 2, 10, "S");
  doc.setLineWidth(0.2);
  doc.setDrawColor(...C_GOLD);
  doc.circle(m + 16, sigY + 2, 8.5, "S");
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_GREEN);
  doc.text("DANISH", m + 16, sigY, { align: "center" });
  doc.text("CATTLE FEED", m + 16, sigY + 3.2, { align: "center" });
  doc.setFontSize(4.5);
  doc.setTextColor(...C_GOLD);
  doc.text("★ FSD ★", m + 16, sigY + 6.5, { align: "center" });

  // Checked by (Cashier/Staff)
  const staffX = m + 55;
  doc.setDrawColor(...C_DARK);
  doc.setLineWidth(0.3);
  doc.line(staffX, sigY + 5, staffX + 45, sigY + 5);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text("Prepared / Checked By", staffX + 22.5, sigY + 9, { align: "center" });

  // Verified / Approved by Supervisor
  const supX = pw - m - 55;
  doc.line(supX, sigY + 5, supX + 55, sigY + 5);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_DARK);
  doc.text("Supervisor Verification & Sign", supX + 27.5, sigY + 9, { align: "center" });

  // Bottom Gold/Green Line
  const footY = ph - 8;
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.8);
  doc.line(m, footY, pw - m, footY);
  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.2);
  doc.line(m, footY + 0.8, pw - m, footY + 0.8);

  doc.setFillColor(...C_GOLD);
  doc.rect(0, ph - 2, pw, 2, "F");

  return sigY + 14;
}

/* ═══════════════════════════════════════════════════════════════════════
   1. TODAY'S SALES REPORT PDF
   ═══════════════════════════════════════════════════════════════════════ */
export interface SalesReportParams {
  sales: any[];
  date: string;
  locationName?: string;
  generatedAt?: string;
}

export async function generateSalesReportPDF(params: SalesReportParams): Promise<void> {
  const { sales, date, locationName = "All Locations", generatedAt } = params;
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  await ensureUrduFontLoaded();

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 12;

  const now = generatedAt || new Date().toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });

  let y = drawReportHeader(
    doc,
    pw,
    m,
    "Sales Report",
    `Comprehensive Daily Sales & Dispatch Summary`,
    [
      { label: "Date", value: date },
      { label: "Location", value: locationName },
      { label: "Generated", value: now },
    ]
  );

  // Compute summary totals
  let totalBilled = 0;
  let totalCash = 0;
  let totalRemaining = 0;
  let totalRickshaw = 0;
  let totalBags = 0;

  const regularSales = sales.filter((s) => !s.mix_order_id);
  const mixSales = sales.filter((s) => !!s.mix_order_id);

  sales.forEach((s) => {
    const qty = Number(s.quantity) || 0;
    const rate = Number(s.rate_per_bag) || 0;
    const rickshaw = Number(s.rickshaw_fare) || 0;
    const cash = Number(s.cash_received) || 0;
    const bill = qty * rate + rickshaw;
    const rem = bill - cash;

    totalBilled += bill;
    totalCash += cash;
    totalRemaining += rem;
    totalRickshaw += rickshaw;
    if (s.unit_type === "bags") {
      totalBags += qty;
    } else {
      totalBags += (s.bag_weight_kg ? qty / s.bag_weight_kg : qty / 40);
    }
  });

  // KPI Summary Cards
  const kpis = [
    { label: "TOTAL BILLED", val: `Rs. ${formatRs(totalBilled)}`, color: C_DARK },
    { label: "CASH COLLECTED", val: `Rs. ${formatRs(totalCash)}`, color: [16, 128, 64] as [number, number, number] },
    { label: "REMAINING / CREDIT", val: `Rs. ${formatRs(totalRemaining)}`, color: totalRemaining > 0 ? ([180, 40, 40] as [number, number, number]) : C_DARK },
    { label: "TOTAL BAGS / QTY", val: `${Number(totalBags).toFixed(1)} Bags (${sales.length} records)`, color: C_DARK },
    { label: "RICKSHAW FARES", val: `Rs. ${formatRs(totalRickshaw)}`, color: C_DARK },
  ];

  const cardW = (pw - m * 2 - (kpis.length - 1) * 3) / kpis.length;
  kpis.forEach((kpi, idx) => {
    const cx = m + idx * (cardW + 3);
    doc.setFillColor(248, 250, 248);
    doc.setDrawColor(...C_GRAY_LIGHT);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, y, cardW, 14, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...C_GRAY);
    doc.text(kpi.label, cx + cardW / 2, y + 4.5, { align: "center" });

    doc.setFontSize(8.5);
    doc.setTextColor(...kpi.color);
    doc.text(kpi.val, cx + cardW / 2, y + 10.5, { align: "center" });
  });

  y += 18;

  // Build Table Rows
  const tableData: string[][] = [];

  let rowIdx = 0;
  sales.forEach((s) => {
    const customerName = s.customers?.name || "Cash Customer";
    const customerType = s.customers?.type || "cash";
    const locName = s.locations?.name || (s.location_id === 1 ? "Farmhouse" : s.location_id === 2 ? "Shop" : "—");
    const productName = s.mix_order_id ? "Custom Mix Order" : (s.products?.name || `Product #${s.product_id}`);
    const qty = Number(s.quantity) || 0;
    const unit = s.unit_type === "kg" ? "KG" : "Bags";
    const rate = Number(s.rate_per_bag) || 0;
    const rickshaw = Number(s.rickshaw_fare) || 0;
    const bill = qty * rate + rickshaw;
    const cash = Number(s.cash_received) || 0;
    const rem = bill - cash;
    const driver = s.rickshaw_driver_name || "—";

    const productCell = driver !== "—" ? `${productName}\n(Driver: ${driver})` : productName;

    tableData.push([
      String(rowIdx + 1),
      customerName,
      customerType === "credit" ? "Credit" : "Cash",
      locName,
      productCell,
      `${qty} ${unit}`,
      formatRs(rate),
      rickshaw > 0 ? formatRs(rickshaw) : "—",
      formatRs(bill),
      formatRs(cash),
      formatRs(rem),
    ]);

    rowIdx++;
  });

  const urduCellMap = createTableUrduCellMap(
    tableData,
    { 1: 30 * 2.835, 4: 53 * 2.835 },
    { fontSize: 7.8, color: "#28323c", scale: 3 }
  );
  const urduHooks = getAutoTableUrduHooks(urduCellMap, doc, { paddingMm: 2 });

  autoTable(doc, {
    startY: y,
    ...urduHooks,
    head: [
      [
        "#",
        "Customer",
        "Type",
        "Location",
        "Product / Description",
        "Qty",
        "Rate (Rs.)",
        "Rickshaw",
        "Bill (Rs.)",
        "Cash (Rs.)",
        "Remaining (Rs.)",
      ],
    ],
    body: tableData,
    foot: [
      [
        "",
        "TOTAL",
        "",
        "",
        `${sales.length} Sales`,
        `${Number(totalBags).toFixed(1)} Bags`,
        "",
        formatRs(totalRickshaw),
        formatRs(totalBilled),
        formatRs(totalCash),
        formatRs(totalRemaining),
      ],
    ],
    theme: "grid",
    headStyles: {
      fillColor: C_GREEN,
      textColor: C_WHITE,
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
      cellPadding: 2,
    },
    footStyles: {
      fillColor: C_GOLD_LIGHT,
      textColor: C_GREEN,
      fontStyle: "bold",
      fontSize: 8.5,
      cellPadding: 2.5,
    },
    bodyStyles: {
      fontSize: 7.8,
      textColor: [40, 50, 60],
      lineColor: C_GRAY_LIGHT,
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 32 },
      2: { cellWidth: 15, halign: "center" },
      3: { cellWidth: 20 },
      4: { cellWidth: 55 },
      5: { cellWidth: 20, halign: "right" },
      6: { cellWidth: 20, halign: "right" },
      7: { cellWidth: 20, halign: "right" },
      8: { cellWidth: 25, halign: "right" },
      9: { cellWidth: 25, halign: "right" },
      10: { cellWidth: 25, halign: "right" },
    },
    margin: { left: m, right: m },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || y + 30;
  drawSupervisorFooter(doc, pw, ph, m, finalY);

  doc.save(`Sales-Report-${date}.pdf`);
}

/* ═══════════════════════════════════════════════════════════════════════
   2. TODAY'S EXPENSES REPORT PDF
   ═══════════════════════════════════════════════════════════════════════ */
export interface ExpensesReportParams {
  expenses: any[];
  date: string;
  generatedAt?: string;
}

export async function generateExpensesReportPDF(params: ExpensesReportParams): Promise<void> {
  const { expenses, date, generatedAt } = params;
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  await ensureUrduFontLoaded();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 15;

  const now = generatedAt || new Date().toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });

  let y = drawReportHeader(
    doc,
    pw,
    m,
    "Expenses Report",
    `Daily Farm & Shop Operational Expenses`,
    [
      { label: "Date", value: date },
      { label: "Records", value: `${expenses.length}` },
      { label: "Generated", value: now },
    ]
  );

  const totalExpense = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  // KPI Summary Cards
  const cardW = (pw - m * 2 - 8) / 2;
  [
    { label: "TOTAL EXPENSES AMOUNT", val: `Rs. ${formatRs(totalExpense)}`, color: [180, 40, 40] as [number, number, number] },
    { label: "TOTAL EXPENSE ENTRIES", val: `${expenses.length} Records`, color: C_DARK },
  ].forEach((kpi, idx) => {
    const cx = m + idx * (cardW + 8);
    doc.setFillColor(248, 250, 248);
    doc.setDrawColor(...C_GRAY_LIGHT);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, y, cardW, 15, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...C_GRAY);
    doc.text(kpi.label, cx + cardW / 2, y + 5, { align: "center" });

    doc.setFontSize(11);
    doc.setTextColor(...kpi.color);
    doc.text(kpi.val, cx + cardW / 2, y + 11.5, { align: "center" });
  });

  y += 20;

  const tableData: string[][] = expenses.map((e, idx) => [
    String(idx + 1),
    date,
    e.description || "General Expense",
    `Rs. ${formatRs(e.amount)}`,
  ]);

  const expensesUrduCellMap = createTableUrduCellMap(
    tableData,
    { 2: 95 * 2.835 },
    { fontSize: 8.5, color: "#28323c", scale: 3 }
  );
  const expensesUrduHooks = getAutoTableUrduHooks(expensesUrduCellMap, doc, { paddingMm: 3 });

  autoTable(doc, {
    startY: y,
    ...expensesUrduHooks,
    head: [["#", "Date", "Expense Description", "Amount (Rs.)"]],
    body: tableData,
    foot: [["", "", "TOTAL EXPENSES", `Rs. ${formatRs(totalExpense)}`]],
    theme: "grid",
    headStyles: {
      fillColor: C_GREEN,
      textColor: C_WHITE,
      fontStyle: "bold",
      fontSize: 9,
      halign: "center",
      cellPadding: 3,
    },
    footStyles: {
      fillColor: C_GOLD_LIGHT,
      textColor: C_GREEN,
      fontStyle: "bold",
      fontSize: 9.5,
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [40, 50, 60],
      lineColor: C_GRAY_LIGHT,
      cellPadding: 3,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 28, halign: "center" },
      2: { cellWidth: 100 },
      3: { cellWidth: 40, halign: "right" },
    },
    margin: { left: m, right: m },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || y + 30;

  // Words note
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text(`Amount in words: ${numberToRupeeWords(totalExpense)}`, m, finalY + 7);

  drawSupervisorFooter(doc, pw, ph, m, finalY + 10);

  doc.save(`Expenses-Report-${date}.pdf`);
}

/* ═══════════════════════════════════════════════════════════════════════
   3. TODAY'S CUSTOMER PAYMENTS REPORT PDF
   ═══════════════════════════════════════════════════════════════════════ */
export interface CustomerPaymentsReportParams {
  payments: any[];
  date: string;
  generatedAt?: string;
}

export async function generateCustomerPaymentsReportPDF(params: CustomerPaymentsReportParams): Promise<void> {
  const { payments, date, generatedAt } = params;
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  await ensureUrduFontLoaded();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 14;

  const now = generatedAt || new Date().toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });

  let y = drawReportHeader(
    doc,
    pw,
    m,
    "Customer Payments",
    `Daily Recovery & Debt Settlement Summary`,
    [
      { label: "Date", value: date },
      { label: "Entries", value: `${payments.length}` },
      { label: "Generated", value: now },
    ]
  );

  let totalAmount = 0;
  let totalAppliedToDebt = 0;
  let totalAppliedToAdvance = 0;

  payments.forEach((p) => {
    totalAmount += Number(p.amount) || 0;
    totalAppliedToDebt += Number(p.applied_to_opening) || 0;
    totalAppliedToAdvance += Number(p.applied_to_advance) || 0;
  });

  // KPI Summary Cards
  const cardW = (pw - m * 2 - 6) / 3;
  [
    { label: "TOTAL PAYMENTS RECOVERED", val: `Rs. ${formatRs(totalAmount)}`, color: [16, 128, 64] as [number, number, number] },
    { label: "APPLIED TO DEBT", val: `Rs. ${formatRs(totalAppliedToDebt)}`, color: C_DARK },
    { label: "CREDITED TO ADVANCE", val: `Rs. ${formatRs(totalAppliedToAdvance)}`, color: C_GREEN },
  ].forEach((kpi, idx) => {
    const cx = m + idx * (cardW + 3);
    doc.setFillColor(248, 250, 248);
    doc.setDrawColor(...C_GRAY_LIGHT);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, y, cardW, 15, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...C_GRAY);
    doc.text(kpi.label, cx + cardW / 2, y + 4.5, { align: "center" });

    doc.setFontSize(10);
    doc.setTextColor(...kpi.color);
    doc.text(kpi.val, cx + cardW / 2, y + 11, { align: "center" });
  });

  y += 20;

  const tableData: string[][] = payments.map((p, idx) => {
    const custName = p.customers?.name || `Customer #${p.customer_id}`;
    const custType = p.customers?.type || "credit";
    const amt = Number(p.amount) || 0;
    const debt = Number(p.applied_to_opening) || 0;
    const adv = Number(p.applied_to_advance) || 0;
    const obBefore = p.opening_balance_before != null ? formatRs(p.opening_balance_before) : "—";
    const obAfter = p.opening_balance_after != null ? formatRs(p.opening_balance_after) : "—";
    const balanceFlow = p.opening_balance_before != null ? `${obBefore} → ${obAfter}` : "—";

    return [
      String(idx + 1),
      custName,
      custType === "credit" ? "Credit" : "Cash",
      formatRs(amt),
      debt > 0 ? formatRs(debt) : "—",
      adv > 0 ? formatRs(adv) : "—",
      balanceFlow,
      p.notes || "—",
    ];
  });

  const payUrduCellMap = createTableUrduCellMap(
    tableData,
    { 1: 38 * 2.835, 7: 24 * 2.835 },
    { fontSize: 7.8, color: "#28323c", scale: 3 }
  );
  const payUrduHooks = getAutoTableUrduHooks(payUrduCellMap, doc, { paddingMm: 2.2 });

  autoTable(doc, {
    startY: y,
    ...payUrduHooks,
    head: [
      [
        "#",
        "Customer Name",
        "Type",
        "Amount Paid",
        "Applied to Debt",
        "Added to Adv.",
        "Debt Before → After",
        "Notes",
      ],
    ],
    body: tableData,
    foot: [
      [
        "",
        "TOTAL",
        "",
        formatRs(totalAmount),
        formatRs(totalAppliedToDebt),
        formatRs(totalAppliedToAdvance),
        "",
        `${payments.length} Payments`,
      ],
    ],
    theme: "grid",
    headStyles: {
      fillColor: C_GREEN,
      textColor: C_WHITE,
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
      cellPadding: 2.5,
    },
    footStyles: {
      fillColor: C_GOLD_LIGHT,
      textColor: C_GREEN,
      fontStyle: "bold",
      fontSize: 8.5,
      cellPadding: 2.5,
    },
    bodyStyles: {
      fontSize: 7.8,
      textColor: [40, 50, 60],
      lineColor: C_GRAY_LIGHT,
      cellPadding: 2.2,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 40 },
      2: { cellWidth: 16, halign: "center" },
      3: { cellWidth: 26, halign: "right" },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 24, halign: "right" },
      6: { cellWidth: 28, halign: "center" },
      7: { cellWidth: 26 },
    },
    margin: { left: m, right: m },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || y + 30;

  // Words note
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text(`Total Recovery in words: ${numberToRupeeWords(totalAmount)}`, m, finalY + 7);

  drawSupervisorFooter(doc, pw, ph, m, finalY + 10);

  doc.save(`Customer-Payments-${date}.pdf`);
}

/* ═══════════════════════════════════════════════════════════════════════
   4. PURCHASE & STOCK HISTORY REPORT PDF
   ═══════════════════════════════════════════════════════════════════════ */
export interface PurchasesReportParams {
  purchases: any[];
  title?: string;
  subtitle?: string;
  generatedAt?: string;
}

export async function generatePurchasesReportPDF(params: PurchasesReportParams): Promise<void> {
  const { purchases, title = "Purchase History", subtitle = "Goods & Stock Intake Statement", generatedAt } = params;
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  await ensureUrduFontLoaded();

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 12;

  const now = generatedAt || new Date().toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });

  let y = drawReportHeader(
    doc,
    pw,
    m,
    title,
    subtitle,
    [
      { label: "Records", value: `${purchases.length}` },
      { label: "Generated", value: now },
    ]
  );

  let totalValue = 0;
  let totalCashPaid = 0;
  let totalDebtSettled = 0;

  purchases.forEach((p) => {
    const qty = Number(p.quantity) || 0;
    const rate = Number(p.rate_per_bag) || 0;
    const val = qty * rate;
    const cash = Number(p.cash_paid) || 0;

    totalValue += val;
    totalCashPaid += cash;
    if (p.settled_by_customer_id) {
      totalDebtSettled += Math.max(0, val - cash);
    }
  });

  // KPI Cards
  const kpis = [
    { label: "TOTAL PURCHASE VALUE", val: `Rs. ${formatRs(totalValue)}`, color: C_DARK },
    { label: "CASH PAID (SUPPLIERS / CLIENTS)", val: `Rs. ${formatRs(totalCashPaid)}`, color: [16, 128, 64] as [number, number, number] },
    { label: "DEBT SETTLEMENT CREDIT", val: `Rs. ${formatRs(totalDebtSettled)}`, color: C_GREEN },
    { label: "PURCHASE ENTRIES", val: `${purchases.length} Records`, color: C_DARK },
  ];

  const cardW = (pw - m * 2 - (kpis.length - 1) * 3) / kpis.length;
  kpis.forEach((kpi, idx) => {
    const cx = m + idx * (cardW + 3);
    doc.setFillColor(248, 250, 248);
    doc.setDrawColor(...C_GRAY_LIGHT);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, y, cardW, 14, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...C_GRAY);
    doc.text(kpi.label, cx + cardW / 2, y + 4.5, { align: "center" });

    doc.setFontSize(9);
    doc.setTextColor(...kpi.color);
    doc.text(kpi.val, cx + cardW / 2, y + 10.5, { align: "center" });
  });

  y += 18;

  const tableData: string[][] = purchases.map((p, idx) => {
    const sourceName = p.settled_by_customer_id
      ? `${p.customers?.name || "Customer"} (Settlement)`
      : p.suppliers?.name || "Supplier";
    const typeLabel = p.settled_by_customer_id ? "Settlement" : "Supplier";
    const prodName = p.products?.name || `Product #${p.product_id}`;
    const qty = Number(p.quantity) || 0;
    const unit = p.unit_type === "bags" ? "Bags" : "KG (loose)";
    const rate = Number(p.rate_per_bag) || 0;
    const val = qty * rate;
    const cash = Number(p.cash_paid) || 0;

    return [
      String(idx + 1),
      p.purchase_date || "—",
      sourceName,
      typeLabel,
      prodName,
      `${qty} ${unit}`,
      formatRs(rate),
      formatRs(val),
      formatRs(cash),
      p.notes || "—",
    ];
  });

  const purUrduCellMap = createTableUrduCellMap(
    tableData,
    { 2: 43 * 2.835, 4: 43 * 2.835, 9: 33 * 2.835 },
    { fontSize: 7.8, color: "#28323c", scale: 3 }
  );
  const purUrduHooks = getAutoTableUrduHooks(purUrduCellMap, doc, { paddingMm: 2 });

  autoTable(doc, {
    startY: y,
    ...purUrduHooks,
    head: [
      [
        "#",
        "Date",
        "Source (Supplier / Customer)",
        "Type",
        "Product",
        "Quantity",
        "Rate (Rs.)",
        "Total Value (Rs.)",
        "Cash Paid (Rs.)",
        "Notes",
      ],
    ],
    body: tableData,
    foot: [
      [
        "",
        "",
        "TOTAL",
        "",
        `${purchases.length} Purchases`,
        "",
        "",
        formatRs(totalValue),
        formatRs(totalCashPaid),
        "",
      ],
    ],
    theme: "grid",
    headStyles: {
      fillColor: C_GREEN,
      textColor: C_WHITE,
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
      cellPadding: 2,
    },
    footStyles: {
      fillColor: C_GOLD_LIGHT,
      textColor: C_GREEN,
      fontStyle: "bold",
      fontSize: 8.5,
      cellPadding: 2.5,
    },
    bodyStyles: {
      fontSize: 7.8,
      textColor: [40, 50, 60],
      lineColor: C_GRAY_LIGHT,
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 20 },
      2: { cellWidth: 45 },
      3: { cellWidth: 22, halign: "center" },
      4: { cellWidth: 45 },
      5: { cellWidth: 24, halign: "right" },
      6: { cellWidth: 22, halign: "right" },
      7: { cellWidth: 28, halign: "right" },
      8: { cellWidth: 28, halign: "right" },
      9: { cellWidth: 35 },
    },
    margin: { left: m, right: m },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || y + 30;
  drawSupervisorFooter(doc, pw, ph, m, finalY);

  doc.save(`Purchase-History-Report.pdf`);
}

/* ═══════════════════════════════════════════════════════════════════════
   5. COMPLETE DAY-END SUPERVISOR EXECUTIVE SUMMARY PDF
   ═══════════════════════════════════════════════════════════════════════ */
export interface DayEndReportParams {
  date: string;
  sales: any[];
  expenses: any[];
  customerPayments: any[];
  purchases: any[];
  generatedAt?: string;
}

export async function generateDayEndSupervisorSummaryPDF(params: DayEndReportParams): Promise<void> {
  const { date, sales, expenses, customerPayments, purchases, generatedAt } = params;
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  await ensureUrduFontLoaded();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 14;

  const now = generatedAt || new Date().toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });

  let y = drawReportHeader(
    doc,
    pw,
    m,
    "Supervisor Day Summary",
    `Complete Daily Operational & Financial Audit`,
    [
      { label: "Audit Date", value: date },
      { label: "Generated", value: now },
    ]
  );

  // Financial calculations
  const totalSalesBilled = sales.reduce(
    (sum, s) => sum + (Number(s.quantity) || 0) * (Number(s.rate_per_bag) || 0) + (Number(s.rickshaw_fare) || 0),
    0
  );
  const totalSalesCash = sales.reduce((sum, s) => sum + (Number(s.cash_received) || 0), 0);
  const totalExpensesAmt = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalCustomerRecovery = customerPayments.reduce((sum, cp) => sum + (Number(cp.amount) || 0), 0);
  const totalPurchasesCash = purchases
    .filter((p) => p.purchase_date === date)
    .reduce((sum, p) => sum + (Number(p.cash_paid) || 0), 0);

  // Net Cash Flow for the day = (Sales Cash + Customer Recovery) - (Expenses + Purchases Cash Paid)
  const totalCashIn = totalSalesCash + totalCustomerRecovery;
  const totalCashOut = totalExpensesAmt + totalPurchasesCash;
  const netCashInHand = totalCashIn - totalCashOut;

  // Executive KPI Grid
  const kpis = [
    { label: "TOTAL SALES BILLED", val: `Rs. ${formatRs(totalSalesBilled)}`, color: C_DARK },
    { label: "CASH IN (SALES + RECOVERY)", val: `Rs. ${formatRs(totalCashIn)}`, color: [16, 128, 64] as [number, number, number] },
    { label: "CASH OUT (EXPENSES + PURCHASES)", val: `Rs. ${formatRs(totalCashOut)}`, color: [180, 40, 40] as [number, number, number] },
    { label: "NET CASH GENERATED", val: `Rs. ${formatRs(netCashInHand)}`, color: netCashInHand >= 0 ? C_GREEN : ([180, 40, 40] as [number, number, number]) },
  ];

  const cardW = (pw - m * 2 - 9) / 4;
  kpis.forEach((kpi, idx) => {
    const cx = m + idx * (cardW + 3);
    doc.setFillColor(248, 250, 248);
    doc.setDrawColor(...C_GRAY_LIGHT);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, y, cardW, 16, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    doc.setTextColor(...C_GRAY);
    doc.text(kpi.label, cx + cardW / 2, y + 4.5, { align: "center" });

    doc.setFontSize(8.5);
    doc.setTextColor(...kpi.color);
    doc.text(kpi.val, cx + cardW / 2, y + 11.5, { align: "center" });
  });

  y += 20;

  // Financial Breakdown Summary Table
  autoTable(doc, {
    startY: y,
    head: [["Category", "Transaction Details", "Inflow (+)", "Outflow (-)"]],
    body: [
      ["Sales Cash Received", `${sales.length} Sales transactions recorded today`, `Rs. ${formatRs(totalSalesCash)}`, "—"],
      ["Customer Payments (Recovery)", `${customerPayments.length} Khata/Debt recovery payments`, `Rs. ${formatRs(totalCustomerRecovery)}`, "—"],
      ["Daily Expenses", `${expenses.length} Operational expense vouchers`, "—", `Rs. ${formatRs(totalExpensesAmt)}`],
      ["Purchases Cash Paid", `Cash paid for stock/feed purchases on ${date}`, "—", `Rs. ${formatRs(totalPurchasesCash)}`],
    ],
    foot: [
      ["NET CASH POSITION", "Net Cash In Hand / Movement for the Day", "", `Rs. ${formatRs(netCashInHand)}`],
    ],
    theme: "grid",
    headStyles: {
      fillColor: C_GREEN,
      textColor: C_WHITE,
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "center",
      cellPadding: 2.5,
    },
    footStyles: {
      fillColor: C_GOLD_LIGHT,
      textColor: C_GREEN,
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [40, 50, 60],
      lineColor: C_GRAY_LIGHT,
      cellPadding: 2.5,
    },
    columnStyles: {
      0: { cellWidth: 45, fontStyle: "bold" },
      1: { cellWidth: 75 },
      2: { cellWidth: 32, halign: "right", textColor: [16, 128, 64] },
      3: { cellWidth: 30, halign: "right", textColor: [180, 40, 40] },
    },
    margin: { left: m, right: m },
  });

  y = (doc as any).lastAutoTable?.finalY + 8;

  // Section 2: Recent Sales Highlight (First 10)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_GREEN);
  doc.text(`TODAY'S SALES BREAKDOWN (${sales.length} total)`, m, y);
  y += 2;

  const salesRows = sales.slice(0, 15).map((s, i) => [
    String(i + 1),
    s.customers?.name || "Cash Customer",
    s.products?.name || (s.mix_order_id ? "Mix Order" : "Feed"),
    `${s.quantity} ${s.unit_type || "bags"}`,
    formatRs(s.rate_per_bag),
    formatRs((Number(s.quantity) || 0) * (Number(s.rate_per_bag) || 0) + (Number(s.rickshaw_fare) || 0)),
    formatRs(s.cash_received),
  ]);

  const daySalesUrduCellMap = createTableUrduCellMap(
    salesRows,
    { 1: 43 * 2.835, 2: 43 * 2.835 },
    { fontSize: 7.2, color: "#28323c", scale: 3 }
  );
  const daySalesUrduHooks = getAutoTableUrduHooks(daySalesUrduCellMap, doc, { paddingMm: 1.8 });

  autoTable(doc, {
    startY: y,
    ...daySalesUrduHooks,
    head: [["#", "Customer", "Product", "Qty", "Rate", "Bill (Rs.)", "Cash (Rs.)"]],
    body: salesRows.length ? salesRows : [["—", "No sales recorded today", "—", "—", "—", "—", "—"]],
    theme: "striped",
    headStyles: { fillColor: [40, 50, 60], fontSize: 7.5, cellPadding: 1.8 },
    bodyStyles: { fontSize: 7.2, cellPadding: 1.8 },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 45 },
      2: { cellWidth: 45 },
      3: { cellWidth: 20, halign: "right" },
      4: { cellWidth: 20, halign: "right" },
      5: { cellWidth: 22, halign: "right" },
      6: { cellWidth: 22, halign: "right" },
    },
    margin: { left: m, right: m },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || y + 30;
  drawSupervisorFooter(doc, pw, ph, m, finalY);

  doc.save(`Day-End-Supervisor-Summary-${date}.pdf`);
}
