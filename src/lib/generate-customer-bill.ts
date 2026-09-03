import type { Sale, Customer } from "@/types";
import type { BillShareInfo } from "@/lib/share-whatsapp";
import { buildCustomerBillCaption } from "@/lib/share-whatsapp";
import {
  ensureUrduFontLoaded,
  hasUrdu,
  renderTextToImageDataUrl,
  renderMultilineTextToImageDataUrl,
  sanitizeUrduForPdf,
  type RenderedTextImage,
} from "@/lib/pdf-urdu";

export interface CustomerBillResult extends BillShareInfo {
  /** Computed total bill (includes mix-order driver rents). */
  totalBill: number;
  /** Computed total cash paid. */
  totalCashPaid: number;
  /** Computed balance due. */
  balanceDue: number;
}

interface CustomerBillData {
  customer: Pick<Customer, "id" | "name" | "type" | "phone">;
  sales: Sale[];
  payments?: Array<{
    id?: number | string;
    payment_date?: string;
    date?: string;
    amount?: number;
    notes?: string | null;
    payment_method?: string | null;
    location?: string | null;
    created_at?: string;
  }>;
  purchases?: Array<{
    id?: number | string;
    purchase_date?: string;
    date?: string;
    quantity?: number;
    rate_per_bag?: number;
    cash_paid?: number;
    products?: { name?: string };
    product_id?: number;
    created_at?: string;
  }>;
  openingBalance: number;
  totalBill: number;
  totalCashPaid: number;
  balanceDue: number;
  generatedAt: string;
  // Customer's current advance balance (paid without buying anything).
  // Subtracted from Balance Due so the bill shows the true net payable.
  // Defaults to 0 when not provided (migration not yet applied).
  advancePayment?: number;
  // Optional mix-order driver info lookup — keyed by mix_order_id.
  // Mix orders store driver info at the order level
  // (not on individual sale rows, where rickshaw_fare = 0).
  // Without this lookup, mix-order rows in the bill would show Rs. 0 rent
  // and miss the driver name.
  mixMeta?: Record<number, { driver_name: string | null; driver_rent: number }>;
  // Optional total of goods-settlement value (paid in goods by customer).
  // Used to recompute the correct Balance Due after we recompute Total Bill
  // from the displayed rows (which include mix-order driver rents the
  // the computed total may not include).
  totalGoodsValue?: number;
}

/* ─── Farm branding constants ─── */
const FARM_NAME = "DANISH CATTLE FEED";
const FARM_TAGLINE = "Cattle Feed Supplier";
// Two physical addresses — shown together on every bill.
// Farm (where cattle feed is produced/stored) + Shop (where retail sale happens).
const FARM_ADDRESS = "Farm: Dry port phatak Faisalabad";
const SHOP_ADDRESS = "Shop: Madni kholoni shamsabad jhumra road";
const FARM_PHONE = "0300-3966715";

function toTitleCase(str?: string | null): string {
  if (!str) return "";
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
}

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

export async function generateCustomerBillPDF(bill: CustomerBillData): Promise<CustomerBillResult> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { numberToRupeeWords } = await import("@/lib/number-to-words");

  // ── Pre-load Noto Nastaliq Urdu font so canvas rendering is ready ──
  // Browser handles Arabic shaping + RTL ordering natively when drawing
  // to <canvas>. We then embed the canvas as a PNG image into the jsPDF
  // document. Without this, Urdu text in product names would render as
  // broken symbols (jsPDF's default helvetica has no Arabic glyphs).
  await ensureUrduFontLoaded();

  // ── Pre-compute ACTUAL totals from displayed sales rows ──
  // These are the source of truth for ALL totals shown in the bill
  // (summary box at top + footer at bottom). They include mix-order
  // driver_rents (which the computed total may NOT include,
  // since driver_rent is at the order level, not on individual sale rows).
  // Solo sale bill amount = qty * rate + rickshaw_fare (rickshaw_fare IS the driver rent).
  // Mix order bill amount = sum(ingredient qty * rate) + driver_rent (looked up via mixMeta).
  let actualTotalBill = 0;
  let actualTotalCash = 0;
  const seenMixOrderIds = new Set<number | string>();
  for (const sale of bill.sales) {
    if (sale.mix_order_id) {
      // Only count each mix order once (its row in the table is collapsed)
      if (seenMixOrderIds.has(sale.mix_order_id)) continue;
      seenMixOrderIds.add(sale.mix_order_id);
      const ingredients = bill.sales.filter((s) => s.mix_order_id === sale.mix_order_id);
      const ingredientsTotal = ingredients.reduce(
        (sum, s) => sum + s.quantity * s.rate_per_bag,
        0,
      );
      const mixMetaEntry = bill.mixMeta?.[Number(sale.mix_order_id)];
      const driverRent = mixMetaEntry?.driver_rent ?? 0;
      actualTotalBill += ingredientsTotal + driverRent;
      actualTotalCash += ingredients.reduce((sum, s) => sum + s.cash_received, 0);
    } else {
      actualTotalBill += sale.quantity * sale.rate_per_bag + sale.rickshaw_fare;
      actualTotalCash += sale.cash_received;
    }
  }

  // Standalone payments
  const standalonePayments = bill.payments || [];
  const totalStandalonePayments = standalonePayments.reduce(
    (sum, p) => sum + (Number(p.amount) || 0),
    0,
  );

  // Goods value from purchases
  const customerPurchases = bill.purchases || [];
  const calculatedGoodsValue = customerPurchases.reduce(
    (sum, pur) =>
      sum +
      Math.max(
        0,
        (Number(pur.quantity) || 0) * (Number(pur.rate_per_bag) || 0) -
          (Number(pur.cash_paid) || 0),
      ),
    0,
  );
  const totalGoodsValue =
    bill.totalGoodsValue !== undefined
      ? bill.totalGoodsValue
      : calculatedGoodsValue;

  const advancePayment = bill.advancePayment ?? 0;
  const effectiveTotalBill = actualTotalBill;
  const effectiveTotalCash = actualTotalCash + totalStandalonePayments;
  const totalReceivedPayments =
    effectiveTotalCash + (Number(totalGoodsValue) || 0) + (Number(advancePayment) || 0);
  const openingBalVal = Number(bill.openingBalance) || 0;
  const effectiveBalanceDue =
    openingBalVal + effectiveTotalBill - totalReceivedPayments;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 15;
  let y = m;

  /* ════════════════════════════════════════════════════════
   *  TOP GOLD LINE
   * ════════════════════════════════════════════════════════ */
  doc.setFillColor(...C_GOLD);
  doc.rect(0, 0, pw, 2.5, "F");

  /* ════════════════════════════════════════════════════════
   *  HEADER — Clean letterhead style
   * ════════════════════════════════════════════════════════ */
  const headerH = 42;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...C_GREEN);
  doc.text(FARM_NAME, m, 13);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_GRAY);
  doc.text(FARM_TAGLINE, m, 19);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text(FARM_ADDRESS, m, 25);
  doc.text(SHOP_ADDRESS, m, 29);
  doc.text(`Phone: ${FARM_PHONE}`, m, 33);

  // Right: LEDGER STATEMENT label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...C_GREEN);
  doc.text("LEDGER", pw - m, 13, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_GRAY);
  doc.text("Customer Statement", pw - m, 19, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_DARK);
  doc.text(`Customer #${bill.customer.id}`, pw - m, 25, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text(`Generated: ${bill.generatedAt}`, pw - m, 29, { align: "right" });

  // Gold + green divider
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.8);
  doc.line(m, headerH, pw - m, headerH);
  doc.setLineWidth(0.2);
  doc.setDrawColor(...C_GREEN);
  doc.line(m, headerH + 1.2, pw - m, headerH + 1.2);

  y = headerH + 7;

  /* ════════════════════════════════════════════════════════
   *  TWO-COLUMN: Customer Info (left) | Summary (right)
   *  Unboxed, clean structured blocks
   * ════════════════════════════════════════════════════════ */
  const colW = (pw - m * 2 - 12) / 2;
  const leftX = m;
  const rightX = m + colW + 12;

  // Left — Customer Info
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_GREEN);
  doc.text("CUSTOMER INFO:", leftX, y + 4);

  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.3);
  doc.line(leftX, y + 6, leftX + 34, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text("Name:", leftX, y + 12);
  doc.text("Phone:", leftX, y + 18);
  doc.text("Type:", leftX, y + 24);

  const rawCustName = bill.customer.name || "N/A";
  if (hasUrdu(rawCustName)) {
    try {
      const custImg = renderTextToImageDataUrl(rawCustName, {
        fontSize: 9,
        bold: true,
        color: "#173337",
        scale: 3,
      });
      const MM_PER_PT = 0.353;
      doc.addImage(custImg.dataUrl, "PNG", leftX + 22, y + 8.5, custImg.widthPt * MM_PER_PT, custImg.heightPt * MM_PER_PT);
    } catch {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...C_DARK);
      doc.text(sanitizeUrduForPdf(rawCustName).slice(0, 26), leftX + 22, y + 12);
    }
  } else {
    const formattedCustName = toTitleCase(rawCustName);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...C_DARK);
    doc.text(formattedCustName.slice(0, 26), leftX + 22, y + 12);
  }
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(bill.customer.phone || "—", leftX + 22, y + 18);
  doc.text(bill.customer.type === "credit" ? "Credit (Udhaar)" : "Cash (Nagad)", leftX + 22, y + 24);

  // Right — Statement Summary
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_GREEN);
  doc.text("SUMMARY:", rightX, y + 4);

  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.3);
  doc.line(rightX, y + 6, rightX + 26, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text("Opening Bal:", rightX, y + 12);
  doc.text("Total Sales:", rightX, y + 18);
  doc.text("Total Paid/Rec:", rightX, y + 24);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_DARK);
  doc.text(`Rs. ${openingBalVal.toLocaleString("en-PK")}`, rightX + 28, y + 12);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(`Rs. ${effectiveTotalBill.toLocaleString("en-PK")}`, rightX + 28, y + 18);
  doc.text(`Rs. ${totalReceivedPayments.toLocaleString("en-PK")}`, rightX + 28, y + 24);

  let sumOffset = 0;
  if (totalGoodsValue > 0) {
    sumOffset += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C_MUTED_GRAY);
    doc.text("Paid in Goods:", rightX, y + 24 + sumOffset);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...C_DARK);
    doc.text(`Rs. ${totalGoodsValue.toLocaleString("en-PK")}`, rightX + 28, y + 24 + sumOffset);
  }

  // Advance Payment row — shown only when customer has advance balance > 0
  if (advancePayment > 0) {
    sumOffset += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C_MUTED_GRAY);
    doc.text("Advance Paid:", rightX, y + 24 + sumOffset);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...C_GREEN);
    doc.text(`Rs. ${(Number(advancePayment) || 0).toLocaleString("en-PK")}`, rightX + 28, y + 24 + sumOffset);
  }

  y += 30 + sumOffset;

  /* ════════════════════════════════════════════════════════
   *  TRANSACTION TIMELINE & TABLE
   *  Row 1 (if opening balance > 0): highlighted "Opening Balance" row
   *  Then chronological items (Sales, Standalone Payments, Goods Settled)
   * ════════════════════════════════════════════════════════ */
  type TimelineItem =
    | {
        type: "mix_order";
        date: string;
        createdAt: string;
        mixOrderId: number | string;
        driverName: string | null;
        driverRent: number;
        billAmount: number;
        cashReceived: number;
      }
    | {
        type: "solo_sale";
        date: string;
        createdAt: string;
        sale: Sale;
      }
    | {
        type: "payment";
        date: string;
        createdAt: string;
        payment: any;
      }
    | {
        type: "purchase";
        date: string;
        createdAt: string;
        purchase: any;
      };

  const timeline: TimelineItem[] = [];

  const processedMixOrderIds = new Set<number | string>();
  bill.sales.forEach((sale) => {
    if (sale.mix_order_id) {
      if (processedMixOrderIds.has(sale.mix_order_id)) return;
      processedMixOrderIds.add(sale.mix_order_id);
      const ingredients = bill.sales.filter((s) => s.mix_order_id === sale.mix_order_id);
      const mixMetaEntry = bill.mixMeta?.[Number(sale.mix_order_id)];
      const driverName = mixMetaEntry?.driver_name ?? sale.rickshaw_driver_name ?? null;
      const driverRent = mixMetaEntry?.driver_rent ?? 0;
      const ingredientsTotal = ingredients.reduce(
        (sum, s) => sum + (Number(s.quantity) || 0) * (Number(s.rate_per_bag) || 0),
        0,
      );
      const totalBillAmount = ingredientsTotal + driverRent;
      const totalCashReceived = ingredients.reduce((sum, s) => sum + (Number(s.cash_received) || 0), 0);
      timeline.push({
        type: "mix_order",
        date: sale.sale_date || "",
        createdAt: sale.created_at || "",
        mixOrderId: sale.mix_order_id,
        driverName,
        driverRent,
        billAmount: totalBillAmount,
        cashReceived: totalCashReceived,
      });
    } else {
      timeline.push({
        type: "solo_sale",
        date: sale.sale_date || "",
        createdAt: sale.created_at || "",
        sale,
      });
    }
  });

  standalonePayments.forEach((p) => {
    timeline.push({
      type: "payment",
      date: p.payment_date || p.date || "",
      createdAt: p.created_at || "",
      payment: p,
    });
  });

  customerPurchases.forEach((pur) => {
    timeline.push({
      type: "purchase",
      date: pur.purchase_date || pur.date || "",
      createdAt: pur.created_at || "",
      purchase: pur,
    });
  });

  // Sort timeline chronologically
  timeline.sort((a, b) => {
    const dComp = (a.date || "").localeCompare(b.date || "");
    if (dComp !== 0) return dComp;
    return (a.createdAt || "").localeCompare(b.createdAt || "");
  });

  type TableRow = {
    data: string[];
    opening?: boolean;
    isPayment?: boolean;
    isPurchase?: boolean;
  };

  const rows: TableRow[] = [];

  // Opening Balance row — only when there is a previous balance
  if (bill.openingBalance > 0) {
    rows.push({
      opening: true,
      data: [
        "—",
        "Prev. Bal.",
        "Opening Balance (purana balance)",
        "—",
        "—",
        "—",
        `Rs. ${bill.openingBalance.toLocaleString("en-PK")}`,
        "—",
      ],
    });
  }

  let rowNum = 1;
  timeline.forEach((item) => {
    if (item.type === "mix_order") {
      const productCell = item.driverName
        ? `Mix Order\n(Driver: ${item.driverName})`
        : "Mix Order";
      rows.push({
        data: [
          String(rowNum),
          item.date || "",
          productCell,
          "—",
          "—",
          item.driverRent > 0 ? `Rs. ${item.driverRent.toLocaleString("en-PK")}` : "—",
          `Rs. ${item.billAmount.toLocaleString("en-PK")}`,
          item.cashReceived > 0 ? `Rs. ${item.cashReceived.toLocaleString("en-PK")}` : "—",
        ],
      });
      rowNum++;
    } else if (item.type === "solo_sale") {
      const sale = item.sale;
      const unitLabel = sale.unit_type === "kg" ? "kg" : "bags";
      const billAmount = Number(sale.quantity) * Number(sale.rate_per_bag) + Number(sale.rickshaw_fare || 0);
      const productName = sale.products?.name || `Product #${sale.product_id}`;
      const productCell = sale.rickshaw_driver_name
        ? `${productName}\n(Driver: ${sale.rickshaw_driver_name})`
        : productName;
      rows.push({
        data: [
          String(rowNum),
          sale.sale_date || "",
          productCell,
          `${Number(sale.quantity).toLocaleString("en-PK")} ${unitLabel}`,
          `Rs. ${Number(sale.rate_per_bag).toLocaleString("en-PK")}`,
          Number(sale.rickshaw_fare) > 0 ? `Rs. ${Number(sale.rickshaw_fare).toLocaleString("en-PK")}` : "—",
          `Rs. ${billAmount.toLocaleString("en-PK")}`,
          Number(sale.cash_received) > 0 ? `Rs. ${Number(sale.cash_received).toLocaleString("en-PK")}` : "—",
        ],
      });
      rowNum++;
    } else if (item.type === "payment") {
      const p = item.payment;
      const desc = p.notes
        ? `Cash Payment / Recovery\n(${p.notes})`
        : "Cash Payment / Recovery";
      rows.push({
        isPayment: true,
        data: [
          String(rowNum),
          item.date || "",
          desc,
          "—",
          "—",
          "—",
          "—",
          `Rs. ${Number(p.amount).toLocaleString("en-PK")}`,
        ],
      });
      rowNum++;
    } else if (item.type === "purchase") {
      const pur = item.purchase;
      const prodName = pur.products?.name || `Product #${pur.product_id}`;
      const debtRed = Math.max(
        0,
        Number(pur.quantity) * Number(pur.rate_per_bag) - Number(pur.cash_paid || 0),
      );
      rows.push({
        isPurchase: true,
        data: [
          String(rowNum),
          item.date || "",
          `Paid in Goods: ${prodName}`,
          `${Number(pur.quantity).toLocaleString("en-PK")} bags`,
          `Rs. ${Number(pur.rate_per_bag).toLocaleString("en-PK")}`,
          "—",
          "—",
          `Rs. ${debtRed.toLocaleString("en-PK")}`,
        ],
      });
      rowNum++;
    }
  });

  // The opening-balance row spans the date column visually using empty string,
  // we leave the date column empty for it.
  // (autoTable doesn't natively support rowSpan; using a "—" marker is fine.)
  if (bill.openingBalance > 0 && rows[0].opening) {
    rows[0].data[1] = "Prev. Bal.";
  }

  const tData = rows.map((r) => r.data);
  const openingRowIndices = rows
    .map((r, i) => (r.opening ? i : -1))
    .filter((i) => i >= 0);
  const paymentRowIndices = rows
    .map((r, i) => (r.isPayment ? i : -1))
    .filter((i) => i >= 0);
  const purchaseRowIndices = rows
    .map((r, i) => (r.isPurchase ? i : -1))
    .filter((i) => i >= 0);

  // ── Pre-render Product column cells that contain Urdu text ──
  // jsPDF's default `helvetica` font has no Arabic glyphs, so any product
  // name containing Urdu (e.g. "Choker — چوکر") would render as broken
  // symbols. We instead render these cells to a <canvas> (browser handles
  // Arabic shaping + RTL ordering + Nastaliq styling natively), export as
  // PNG, and embed into the PDF via doc.addImage() in didDrawCell.
  //
  // Pure-Roman cells stay with autoTable's native text rendering (faster
  // and looks better for Latin text).
  const productCellImages = new Map<number, RenderedTextImage>();
  const PT_PER_MM = 2.835; // 1mm ≈ 2.835pt
  const PRODUCT_COL_WIDTH_MM = 35;
  const PRODUCT_COL_PADDING_MM = 2.5;
  const PRODUCT_COL_USABLE_PT = (PRODUCT_COL_WIDTH_MM - PRODUCT_COL_PADDING_MM * 2) * PT_PER_MM;

  rows.forEach((row, idx) => {
    const productText = row.data[2];
    if (hasUrdu(productText)) {
      try {
        const image = renderMultilineTextToImageDataUrl(productText, {
          fontSize: 8.5,
          color: "#28323c", // matches bodyStyles.textColor [40, 50, 60]
          maxWidthPt: PRODUCT_COL_USABLE_PT,
          lineHeightPt: 8.5 * 1.15,
          scale: 3,
        });
        productCellImages.set(idx, image);
      } catch (e) {
        // Canvas rendering failed (e.g. SSR fallback) — leave cell as text
        console.warn("Urdu cell image render failed, falling back to text:", e);
      }
    }
  });

  // effectiveTotalBill / effectiveTotalCash / effectiveBalanceDue are
  // computed upfront at the top of this function (so the summary box at
  // the top of the bill can use the same values). Reuse them here for
  // the totals box at the bottom of the bill.
  const openingBalStr = `Rs. ${openingBalVal.toLocaleString("en-PK")}`;
  const totalBillStr = `Rs. ${effectiveTotalBill.toLocaleString("en-PK")}`;
  const totalCashStr = `Rs. ${actualTotalCash.toLocaleString("en-PK")}`;
  const totalPaidStr = `Rs. ${totalReceivedPayments.toLocaleString("en-PK")}`;
  const balanceStr = `Rs. ${effectiveBalanceDue.toLocaleString("en-PK")}`;

  autoTable(doc, {
    startY: y,
    head: [["#", "Date", "Product", "Qty", "Rate", "Driver Rent", "Bill Amt", "Cash Paid"]],
    body: tData,
    foot: [["", "", "", "", "", "TOTAL", totalBillStr, totalCashStr]],
    theme: "grid",
    headStyles: {
      fillColor: C_GREEN,
      textColor: C_WHITE,
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "center",
      lineColor: C_GREEN,
      lineWidth: 0.1,
      cellPadding: 2.5,
    },
    footStyles: {
      fillColor: C_GOLD_LIGHT,
      textColor: C_GREEN,
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: 2.5,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [40, 50, 60],
      lineColor: C_GRAY_LIGHT,
      cellPadding: 2.5,
    },
    // Highlight the opening-balance row(s) in amber, payments in emerald, goods in purple
    didParseCell: (hookData) => {
      if (
        hookData.section === "body" &&
        openingRowIndices.includes(hookData.row.index)
      ) {
        hookData.cell.styles.fillColor = C_GOLD_LIGHT;
        hookData.cell.styles.textColor = C_GREEN;
        hookData.cell.styles.fontStyle = "bold";
      } else if (
        hookData.section === "body" &&
        paymentRowIndices.includes(hookData.row.index)
      ) {
        hookData.cell.styles.fillColor = [236, 253, 245];
        hookData.cell.styles.textColor = [6, 95, 70];
        hookData.cell.styles.fontStyle = "bold";
      } else if (
        hookData.section === "body" &&
        purchaseRowIndices.includes(hookData.row.index)
      ) {
        hookData.cell.styles.fillColor = [245, 243, 255];
        hookData.cell.styles.textColor = [107, 33, 168];
      }
      // For Product column cells with Urdu text, replace text with spaces
      // (preserves line count → row height stays correct) — the actual
      // content will be drawn as an image in didDrawCell.
      if (
        hookData.section === "body" &&
        hookData.column.index === 2 &&
        productCellImages.has(hookData.row.index)
      ) {
        hookData.cell.text = hookData.cell.text.map(() => " ");
      } else if (hookData.section === "body") {
        const txt = Array.isArray(hookData.cell.text) ? hookData.cell.text.join(" ") : String(hookData.cell.text || "");
        if (hasUrdu(txt)) {
          const sanitized = sanitizeUrduForPdf(txt);
          hookData.cell.text = sanitized ? [sanitized] : [" "];
        }
      }
    },
    // Render Urdu Product cells as embedded PNG images
    didDrawCell: (hookData) => {
      if (
        hookData.section === "body" &&
        hookData.column.index === 2 &&
        productCellImages.has(hookData.row.index)
      ) {
        const image = productCellImages.get(hookData.row.index)!;
        const cell = hookData.cell;
        const padding = 2.5; // mm — matches bodyStyles.cellPadding
        const maxWmm = cell.width - padding * 2;
        const maxHmm = cell.height - padding * 2;
        // Convert image pt dims → mm: 1pt ≈ 0.353mm
        const MM_PER_PT = 0.353;
        const imgWmm = image.widthPt * MM_PER_PT;
        const imgHmm = image.heightPt * MM_PER_PT;
        // Fit within cell, preserve aspect ratio, don't upscale
        const scale = Math.min(maxWmm / imgWmm, maxHmm / imgHmm, 1);
        const drawW = imgWmm * scale;
        const drawH = imgHmm * scale;
        const imgX = cell.x + padding;
        const imgY = cell.y + (cell.height - drawH) / 2;
        try {
          doc.addImage(image.dataUrl, "PNG", imgX, imgY, drawW, drawH);
        } catch (e) {
          // If image embedding fails, fall back to drawing the original text
          console.warn("Urdu image embed failed:", e);
        }
      }
    },
    alternateRowStyles: { fillColor: [249, 251, 249] },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 22 },
      2: { cellWidth: 35 },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 20, halign: "right" },
      6: { cellWidth: 28, halign: "right" },
      7: { cellWidth: 28, halign: "right" },
    },
    margin: { left: m, right: m },
  });

  /* ════════════════════════════════════════════════════════
   *  TOTALS SECTION (Streamlined Summary) + Amount in words
   * ════════════════════════════════════════════════════════ */
  const fy = (doc as any).lastAutoTable.finalY + 8;
  const tBoxW = 98;
  const tBoxX = pw - m - tBoxW;
  let ty = fy + 5;
  const labelX = tBoxX;
  const valX = pw - m;

  // 1. Opening Balance (Purana Baqaya)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text("Opening Balance (Purana Baqaya):", labelX, ty);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_DARK);
  doc.text(openingBalStr, valX, ty, { align: "right" });

  // 2. Total Sales / Purchases (Naya Bill)
  ty += 6.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text("Total Sales / Purchases (Naya Bill):", labelX, ty);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_DARK);
  doc.text(totalBillStr, valX, ty, { align: "right" });

  // 3. Total Received / Payments (Wasooli)
  ty += 6.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text("Total Received / Payments (Wasooli):", labelX, ty);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_DARK);
  doc.text(totalPaidStr, valX, ty, { align: "right" });

  // Divider line before Balance Due
  ty += 4;
  doc.setDrawColor(...C_GRAY_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(labelX, ty, valX, ty);

  // 4. Net Balance Due (Kul Baqaya)
  ty += 6.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...C_GREEN);
  doc.text("Net Balance Due (Kul Baqaya):", labelX, ty);
  doc.setFontSize(12);
  doc.text(balanceStr, valX, ty, { align: "right" });

  // Double bottom border under Balance Due
  ty += 2.5;
  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.6);
  doc.line(labelX, ty, valX, ty);
  doc.setLineWidth(0.2);
  doc.line(labelX, ty + 0.8, valX, ty + 0.8);

  // Amount in words — left side, strictly left-aligned opposite summary table
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text("Balance in words:", m, fy + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_DARK);
  const wordsText = numberToRupeeWords(effectiveBalanceDue);
  const wordsLines = doc.splitTextToSize(wordsText, tBoxX - m - 6);
  doc.text(wordsLines, m, fy + 11, { lineHeightFactor: 1.3 });

  /* ════════════════════════════════════════════════════════
   *  TERMS & CONDITIONS — Clean left-aligned layout
   * ════════════════════════════════════════════════════════ */
  const tcY = Math.max(ty + 14, fy + 32);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C_GREEN);
  doc.text("TERMS & CONDITIONS", m, tcY);

  doc.setDrawColor(...C_GRAY_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(m, tcY + 2, pw - m, tcY + 2);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text("1. This is a computer-generated statement based on recorded transactions.", m, tcY + 7);
  doc.text("2. Please verify balances and report discrepancies within 7 days.", m, tcY + 11.5);
  doc.text("3. All disputes are subject to Faisalabad jurisdiction.", m, tcY + 16);

  /* ════════════════════════════════════════════════════════
   *  SIGNATURE SECTION — Spaced with generous breathing room
   * ════════════════════════════════════════════════════════ */
  let sigY = tcY + 30;
  if (sigY > ph - 36) sigY = ph - 36;

  doc.setDrawColor(...C_DARK);
  doc.setLineWidth(0.4);
  doc.line(pw - m - 65, sigY, pw - m, sigY);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text("For Danish Cattle Feed", pw - m - 32.5, sigY + 4.5, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_DARK);
  doc.text("Authorised Signatory", pw - m - 32.5, sigY + 9, { align: "center" });

  // Stamp circle on left
  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.5);
  doc.circle(m + 16, sigY - 4, 12, "S");
  doc.setLineWidth(0.2);
  doc.setDrawColor(...C_GOLD);
  doc.circle(m + 16, sigY - 4, 10, "S");
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_GREEN);
  doc.text("DANISH", m + 16, sigY - 6.5, { align: "center" });
  doc.text("CATTLE FEED", m + 16, sigY - 2.5, { align: "center" });
  doc.setFontSize(5);
  doc.setTextColor(...C_GOLD);
  doc.text("★ FSD ★", m + 16, sigY + 1.5, { align: "center" });

  /* ════════════════════════════════════════════════════════
   *  CLEAN FOOTER — Bottom Yellow/Gold Border Line Only
   *  (No software provider or contact text, completely blank white)
   * ════════════════════════════════════════════════════════ */
  const footY = ph - 10;
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.8);
  doc.line(m, footY, pw - m, footY);
  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.2);
  doc.line(m, footY + 1, pw - m, footY + 1);

  doc.setFillColor(...C_GOLD);
  doc.rect(0, ph - 2, pw, 2, "F");

  const fileName = `Khata-Bill-${bill.customer.name.replace(/\s+/g, "-")}-${bill.customer.id}.pdf`;
  doc.save(fileName);

  // Return blob + caption so callers can offer WhatsApp sharing.
  const caption = buildCustomerBillCaption({
    customerName: bill.customer.name ?? "N/A",
    generatedAt: bill.generatedAt,
    totalBill: effectiveTotalBill,
    cashPaid: totalReceivedPayments,
    balanceDue: effectiveBalanceDue,
    advancePayment,
  });
  return {
    blob: doc.output("blob"),
    fileName,
    caption,
    totalBill: effectiveTotalBill,
    totalCashPaid: totalReceivedPayments,
    balanceDue: effectiveBalanceDue,
  };
}
