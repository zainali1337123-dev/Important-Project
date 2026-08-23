import type { BillShareInfo } from "@/lib/share-whatsapp";
import { buildMixBillCaption } from "@/lib/share-whatsapp";
import {
  ensureUrduFontLoaded,
  hasUrdu,
  renderTextToImageDataUrl,
  renderMultilineTextToImageDataUrl,
  sanitizeUrduForPdf,
  type RenderedTextImage,
} from "@/lib/pdf-urdu";

interface BillItem {
  product: string;
  weight_kg: number;
  rate_per_kg: number;
  amount: number;
  bags?: number | null;
  rate_per_bag?: number | null;
  bag_amount?: number | null;
  // ── New unit-based pricing fields (owner upgrade, Aug 2026) ──
  // When present, the table shows "Quoted Rate" (Rs. X / Y kg) instead
  // of the legacy "Rate / kg" column.
  rate_basis_weight?: number | null;
  quoted_rate?: number | null;
}

interface BillData {
  orderId: string;
  customerName: string;
  customerType: "credit" | "cash";
  orderDate: string;
  location?: string | null;
  items: BillItem[];
  totalWeight: number;
  totalAmount: number;
  totalBagAmount?: number;
  cashReceived?: number;
  driverName?: string | null;
  driverRent?: number;
}

/* ─── Farm branding constants ─── */
const FARM_NAME = "DANISH CATTLE FEED";
const FARM_TAGLINE = "Cattle Feed Supplier";
// Two physical addresses — shown together on every bill.
const FARM_ADDRESS = "Farm: Dry port phatak Faisalabad";
const SHOP_ADDRESS = "Shop: Madni kholoni shamsabad jhumra road";
const FARM_PHONE = "0300-3966715";

function toTitleCase(str?: string | null): string {
  if (!str) return "";
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
}

/* Color palette — refined deep forest/teal + warm gold */
const C_GREEN: [number, number, number] = [8, 80, 57];
const C_GREEN_LIGHT: [number, number, number] = [240, 244, 240];
const C_GOLD: [number, number, number] = [245, 196, 56];
const C_GOLD_LIGHT: [number, number, number] = [252, 247, 232];
const C_DARK: [number, number, number] = [23, 51, 55];
const C_MUTED_GRAY: [number, number, number] = [85, 85, 85];
const C_GRAY: [number, number, number] = [107, 124, 127];
const C_GRAY_LIGHT: [number, number, number] = [220, 229, 229];
const C_WHITE: [number, number, number] = [255, 255, 255];

export async function generateMixBillPDF(bill: BillData): Promise<BillShareInfo> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { numberToRupeeWords } = await import("@/lib/number-to-words");

  // Pre-load Noto Nastaliq Urdu font so canvas rendering is ready
  // for product names that contain Urdu text (e.g. "Choker — چوکر").
  await ensureUrduFontLoaded();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 14;
  let y = m;

  /* ════════════════════════════════════════════════════════
   *  TOP GOLD LINE
   * ════════════════════════════════════════════════════════ */
  doc.setFillColor(...C_GOLD);
  doc.rect(0, 0, pw, 2.5, "F");

  /* ════════════════════════════════════════════════════════
   *  HEADER — Clean letterhead style (white bg, green text)
   * ════════════════════════════════════════════════════════ */
  const headerH = 42;
  // Left: Farm name block — strictly left aligned at margin m
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

  // Right: INVOICE label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...C_GREEN);
  doc.text("INVOICE", pw - m, 13, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_GRAY);
  doc.text("Mix Order", pw - m, 19, { align: "right" });

  // Bill No + Date on right
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_DARK);
  doc.text(`Bill No: #${bill.orderId}`, pw - m, 25, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text(`Date: ${bill.orderDate}`, pw - m, 29, { align: "right" });

  // Horizontal divider line (gold + green accent)
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.8);
  doc.line(m, headerH, pw - m, headerH);
  doc.setLineWidth(0.2);
  doc.setDrawColor(...C_GREEN);
  doc.line(m, headerH + 1.2, pw - m, headerH + 1.2);

  y = headerH + 7;

  /* ════════════════════════════════════════════════════════
   *  TWO-COLUMN: Bill To (left) | Order Details (right)
   *  Clean, unboxed structured text blocks with bold green headers
   * ════════════════════════════════════════════════════════ */
  const colW = (pw - m * 2 - 12) / 2; // 12mm gap between columns
  const leftX = m;
  const rightX = m + colW + 12;

  // Left Column — BILL TO (unboxed, left-aligned)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_GREEN);
  doc.text("BILL TO:", leftX, y + 4);

  // Subtle bottom underline for section header
  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.3);
  doc.line(leftX, y + 6, leftX + 28, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text("Customer Name:", leftX, y + 12);
  doc.text("Order Type:", leftX, y + 18);
  doc.text("Driver:", leftX, y + 24);

  const rawCustName = bill.customerName || "N/A";
  if (hasUrdu(rawCustName)) {
    try {
      const custImg = renderTextToImageDataUrl(rawCustName, {
        fontSize: 9,
        bold: true,
        color: "#173337",
        scale: 3,
      });
      const MM_PER_PT = 0.353;
      doc.addImage(custImg.dataUrl, "PNG", leftX + 28, y + 8.5, custImg.widthPt * MM_PER_PT, custImg.heightPt * MM_PER_PT);
    } catch {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...C_DARK);
      doc.text(sanitizeUrduForPdf(rawCustName).slice(0, 26), leftX + 28, y + 12);
    }
  } else {
    const formattedCustName = toTitleCase(rawCustName);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...C_DARK);
    doc.text(formattedCustName.slice(0, 26), leftX + 28, y + 12);
  }
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(bill.customerType === "credit" ? "Credit (Udhaar)" : "Cash (Nagad)", leftX + 28, y + 18);
  doc.text(toTitleCase(bill.driverName)?.slice(0, 22) || "—", leftX + 28, y + 24);

  // Right Column — ORDER DETAILS (unboxed)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_GREEN);
  doc.text("ORDER DETAILS:", rightX, y + 4);

  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.3);
  doc.line(rightX, y + 6, rightX + 38, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text("Bill No:", rightX, y + 12);
  doc.text("Order Date:", rightX, y + 18);
  doc.text("Target Weight:", rightX, y + 24);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_DARK);
  doc.text(`#${bill.orderId}`, rightX + 26, y + 12);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(bill.orderDate, rightX + 26, y + 18);
  doc.setFont("helvetica", "bold");
  doc.text(`${bill.totalWeight.toLocaleString("en-PK")} kg`, rightX + 26, y + 24);

  y += 30;

  /* ════════════════════════════════════════════════════════
   *  INGREDIENTS TABLE
   * ════════════════════════════════════════════════════════ */
  const hasBagInfo = bill.items.some(
    (i) => (i.bags && i.bags > 0) || (i.rate_per_bag && i.rate_per_bag > 0)
  );
  // New unit-based pricing: if at least one item has the audit fields,
  // show "Quoted Rate" (Rs. X / Y kg) instead of "Rate / kg".
  const hasQuotedRates = bill.items.some(
    (i) => i.rate_basis_weight != null && i.quoted_rate != null
  );

  let head: string[];
  let tData: string[][];
  let columnStyles: Record<number, any>;

  if (hasBagInfo) {
    // Legacy 8-col layout — kept for backward compat with old bills that
    // had manual Bags + Rate/Bag entries. New mix orders no longer use this.
    head = ["#", "Product", "Wt (kg)", "Rate/kg", "Amount", "Bags", "Rate/Bag", "Bag Amt"];
    tData = bill.items.map((ing, i) => [
      String(i + 1),
      ing.product,
      ing.weight_kg.toLocaleString("en-PK"),
      `Rs. ${ing.rate_per_kg.toLocaleString("en-PK")}`,
      `Rs. ${ing.amount.toLocaleString("en-PK")}`,
      ing.bags ? String(ing.bags) : "—",
      ing.rate_per_bag ? `Rs. ${ing.rate_per_bag.toLocaleString("en-PK")}` : "—",
      ing.bag_amount ? `Rs. ${ing.bag_amount.toLocaleString("en-PK")}` : "—",
    ]);
    columnStyles = {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 38 },
      2: { cellWidth: 18, halign: "right" },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 26, halign: "right" },
      5: { cellWidth: 14, halign: "right" },
      6: { cellWidth: 22, halign: "right" },
      7: { cellWidth: 22, halign: "right" },
    };
  } else if (hasQuotedRates) {
    // ── New unit-based pricing layout (owner upgrade, Aug 2026) ──
    // Replaces the legacy "Rate / kg" column with "Quoted Rate" showing
    // the original quote (Rs. X / Y kg). Effective per-kg rate is no
    // longer displayed on the bill — it remains stored in the DB for
    // audit / calculation purposes only.
    head = ["#", "Product Name", "Weight (kg)", "Quoted Rate", "Amount"];
    tData = bill.items.map((ing, i) => [
      String(i + 1),
      ing.product,
      ing.weight_kg.toLocaleString("en-PK"),
      ing.quoted_rate != null && ing.rate_basis_weight != null
        ? `Rs. ${ing.quoted_rate.toLocaleString("en-PK")} / ${ing.rate_basis_weight} kg`
        : `Rs. ${ing.rate_per_kg.toLocaleString("en-PK")}/kg`,
      `Rs. ${ing.amount.toLocaleString("en-PK")}`,
    ]);
    columnStyles = {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 50 },
      2: { cellWidth: 28, halign: "right" },
      3: { cellWidth: 42, halign: "right" },
      4: { cellWidth: 36, halign: "right" },
    };
  } else {
    // Fallback: old mix orders without quoted rate info — keep Rate/kg
    // column for backward compat (e.g. if a saved mix is reprinted).
    head = ["#", "Product Name", "Weight (kg)", "Rate / kg", "Amount"];
    tData = bill.items.map((ing, i) => [
      String(i + 1),
      ing.product,
      ing.weight_kg.toLocaleString("en-PK"),
      `Rs. ${ing.rate_per_kg.toLocaleString("en-PK")}`,
      `Rs. ${ing.amount.toLocaleString("en-PK")}`,
    ]);
    columnStyles = {
      0: { cellWidth: 12, halign: "center" },
      2: { cellWidth: 30, halign: "right" },
      3: { cellWidth: 35, halign: "right" },
      4: { cellWidth: 40, halign: "right" },
    };
  }

  const tw = bill.items.reduce((s, i) => s + i.weight_kg, 0).toLocaleString("en-PK");
  const ta = `Rs. ${bill.totalAmount.toLocaleString("en-PK")}`;

  // ── Pre-render Product column cells that contain Urdu text ──
  // Product column is index 1 in all 3 layouts (legacy / quoted / fallback).
  // Column width varies per layout — pick the right one for image wrapping.
  const PRODUCT_COL_IDX = 1;
  const productColWidthMm =
    hasBagInfo ? 38 : hasQuotedRates ? 50 : 50; // fallback default 50mm
  const PRODUCT_COL_PADDING_MM = 2.5;
  const PT_PER_MM = 2.835;
  const productColUsablePt = (productColWidthMm - PRODUCT_COL_PADDING_MM * 2) * PT_PER_MM;

  const productCellImages = new Map<number, RenderedTextImage>();
  bill.items.forEach((ing, idx) => {
    if (hasUrdu(ing.product)) {
      try {
        const image = renderMultilineTextToImageDataUrl(ing.product, {
          fontSize: 8.5,
          color: "#28323c",
          maxWidthPt: productColUsablePt,
          lineHeightPt: 8.5 * 1.15,
          scale: 3,
        });
        productCellImages.set(idx, image);
      } catch (e) {
        console.warn("Mix-bill Urdu cell image render failed:", e);
      }
    }
  });

  const foot: string[] = hasBagInfo
    ? ["", "TOTAL", `${tw} kg`, "", ta, "", "", (bill.totalBagAmount ?? 0) > 0 ? `Rs. ${(bill.totalBagAmount ?? 0).toLocaleString("en-PK")}` : ""]
    : ["", "TOTAL", `${tw} kg`, "", ta];

  autoTable(doc, {
    startY: y,
    head: [head],
    body: tData,
    foot: [foot],
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
    // Clear text for Product column cells that have Urdu — we'll render
    // them as images in didDrawCell. Replacing text with spaces preserves
    // the line count so row height computation is unaffected.
    didParseCell: (hookData) => {
      if (
        hookData.section === "body" &&
        hookData.column.index === PRODUCT_COL_IDX &&
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
        hookData.column.index === PRODUCT_COL_IDX &&
        productCellImages.has(hookData.row.index)
      ) {
        const image = productCellImages.get(hookData.row.index)!;
        const cell = hookData.cell;
        const padding = 2.5; // mm
        const maxWmm = cell.width - padding * 2;
        const maxHmm = cell.height - padding * 2;
        const MM_PER_PT = 0.353;
        const imgWmm = image.widthPt * MM_PER_PT;
        const imgHmm = image.heightPt * MM_PER_PT;
        const scale = Math.min(maxWmm / imgWmm, maxHmm / imgHmm, 1);
        const drawW = imgWmm * scale;
        const drawH = imgHmm * scale;
        const imgX = cell.x + padding;
        const imgY = cell.y + (cell.height - drawH) / 2;
        try {
          doc.addImage(image.dataUrl, "PNG", imgX, imgY, drawW, drawH);
        } catch (e) {
          console.warn("Mix-bill Urdu image embed failed:", e);
        }
      }
    },
    alternateRowStyles: { fillColor: [249, 251, 249] },
    columnStyles,
    margin: { left: m, right: m },
  });

  /* ════════════════════════════════════════════════════════
   *  TOTALS SECTION (Unboxed summary list) + Amount in words
   * ════════════════════════════════════════════════════════ */
  const fy = (doc as any).lastAutoTable.finalY + 8;
  const hasDriverRent = bill.driverRent && bill.driverRent > 0;
  const isCash = bill.customerType === "cash" && bill.cashReceived !== undefined;
  const subtotal = bill.totalAmount;
  const subtotalStr = `Rs. ${subtotal.toLocaleString("en-PK")}`;
  const grandTotal = subtotal + (hasDriverRent ? bill.driverRent! : 0);
  const grandTotalStr = `Rs. ${grandTotal.toLocaleString("en-PK")}`;

  const BAG_KG = 40;
  const totalBags = bill.items.reduce(
    (sum, i) => sum + (i.bags && i.bags > 0 ? i.bags : i.weight_kg / BAG_KG),
    0,
  );
  const hasAsRatePerBag = totalBags > 0;
  const asRatePerBag = hasAsRatePerBag ? subtotal / totalBags : 0;
  const asRatePerBagStr = hasAsRatePerBag
    ? `Rs. ${asRatePerBag.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`
    : "";

  // Totals unboxed summary on right side
  const tBoxW = 85;
  const tBoxX = pw - m - tBoxW;
  let ty = fy + 5;
  const labelX = tBoxX;
  const valX = pw - m;

  // Subtotal
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text("Subtotal:", labelX, ty);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_DARK);
  doc.text(subtotalStr, valX, ty, { align: "right" });

  // As Rate/Bag
  if (hasAsRatePerBag) {
    ty += 6.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...C_MUTED_GRAY);
    doc.text(`As Rate/Bag (${totalBags.toLocaleString("en-PK", { maximumFractionDigits: 2 })} bags):`, labelX, ty);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_DARK);
    doc.text(asRatePerBagStr, valX, ty, { align: "right" });
  }

  // Driver Rent
  if (hasDriverRent) {
    ty += 6.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C_MUTED_GRAY);
    doc.text("Driver Rent:", labelX, ty);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_DARK);
    doc.text(`Rs. ${bill.driverRent!.toLocaleString("en-PK")}`, valX, ty, { align: "right" });
  }

  // Divider line before Grand Total
  ty += 4.5;
  doc.setDrawColor(...C_GRAY_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(labelX, ty, valX, ty);

  // Grand Total
  ty += 6.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...C_GREEN);
  doc.text("GRAND TOTAL", labelX, ty);
  doc.text(grandTotalStr, valX, ty, { align: "right" });

  // Double bottom border under Grand Total
  ty += 2.5;
  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.6);
  doc.line(labelX, ty, valX, ty);
  doc.setLineWidth(0.2);
  doc.line(labelX, ty + 0.8, valX, ty + 0.8);

  // Cash received + change
  if (isCash) {
    const cash = bill.cashReceived as number;
    ty += 6.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...C_MUTED_GRAY);
    doc.text("Cash Received:", labelX, ty);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_DARK);
    doc.text(`Rs. ${cash.toLocaleString("en-PK")}`, valX, ty, { align: "right" });

    ty += 5.5;
    const change = cash - grandTotal;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C_MUTED_GRAY);
    doc.text("Change:", labelX, ty);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(change >= 0 ? 8 : 180, change >= 0 ? 120 : 30, change >= 0 ? 60 : 30);
    doc.text(`Rs. ${change.toLocaleString("en-PK")}`, valX, ty, { align: "right" });
  }

  // Amount in words — left side, strictly left-aligned at margin m
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text("Amount in words:", m, fy + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_DARK);
  const wordsText = numberToRupeeWords(grandTotal);
  const wordsLines = doc.splitTextToSize(wordsText, tBoxX - m - 6);
  doc.text(wordsLines, m, fy + 11);

  /* ════════════════════════════════════════════════════════
   *  TERMS & CONDITIONS — Clean left-aligned layout
   * ════════════════════════════════════════════════════════ */
  const tcY = Math.max(ty + 14, fy + 32);

  // Section title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C_GREEN);
  doc.text("TERMS & CONDITIONS", m, tcY);

  // Divider line
  doc.setDrawColor(...C_GRAY_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(m, tcY + 2, pw - m, tcY + 2);

  // Perfectly left-aligned terms list
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text("1. Goods once sold will not be returned or exchanged.", m, tcY + 7);
  doc.text("2. All disputes are subject to Faisalabad jurisdiction.", m, tcY + 11.5);
  doc.text("3. Please verify bill details at the time of delivery.", m, tcY + 16);

  /* ════════════════════════════════════════════════════════
   *  SIGNATURE SECTION — Spaced with generous breathing room
   * ════════════════════════════════════════════════════════ */
  let sigY = tcY + 30;
  if (sigY > ph - 36) sigY = ph - 36;

  // Signature line on right with increased top breathing room
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

  // Stamp circle on left with clean padding
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

  // Bottom gold bar
  doc.setFillColor(...C_GOLD);
  doc.rect(0, ph - 2, pw, 2, "F");

  const fileName = `Mix-Bill-${bill.orderId}-${bill.customerName.replace(/\s+/g, "-")}.pdf`;
  doc.save(fileName);

  // Return blob + caption so callers can offer WhatsApp sharing.
  // grandTotal was computed above (subtotal + driver rent).
  const caption = buildMixBillCaption({
    orderId: bill.orderId,
    customerName: bill.customerName,
    orderDate: bill.orderDate,
    grandTotal,
    cashReceived: bill.cashReceived,
    driverName: bill.driverName ?? null,
  });
  return {
    blob: doc.output("blob"),
    fileName,
    caption,
  };
}
