import type { Purchase, Customer, Supplier, Product } from "@/types";
import type { BillShareInfo } from "@/lib/share-whatsapp";
import { buildPurchaseBillCaption } from "@/lib/share-whatsapp";
import {
  ensureUrduFontLoaded,
  hasUrdu,
  renderTextToImageDataUrl,
  renderMultilineTextToImageDataUrl,
  sanitizeUrduForPdf,
  type RenderedTextImage,
} from "@/lib/pdf-urdu";

/* ─── Farm branding constants (matches generate-customer-bill.ts) ─── */
const FARM_NAME = "DANISH CATTLE FEED";
const FARM_TAGLINE = "Cattle Feed Supplier";
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
const C_AMBER: [number, number, number] = [194, 138, 36];

/**
 * Generate a PDF BILL for a single purchase record.
 *
 * Works for BOTH types of purchases:
 *   1. Supplier purchase (settled_by_customer_id IS NULL) — we bought
 *      goods from a supplier and paid them cash.
 *   2. Buy-from-customer (settled_by_customer_id IS NOT NULL) — we
 *      bought goods from a customer and owe them money.
 *
 * The header label and the "purchased from" box adapt based on which
 * counterparty is present.
 *
 * Layout (single-page A4 portrait):
 *   ┌────────────────────────────────────────────────────────┐
 *   │  DANISH FARMHOUSE       (gold top line)                │
 *   │  Cattle Feed Supplier                                  │
 *   │  Address / Phone                PURCHASE BILL          │
 *   │  ───────────────────────────────────────────────────   │
 *   │  Purchased From  |  Bill Summary                       │
 *   │  ───────────────────────────────────────────────────   │
 *   │  Item table (single row: product, qty, rate, total)    │
 *   │  ───────────────────────────────────────────────────   │
 *   │  Total Amount / Cash Paid / Pending                    │
 *   │  Notes                                                 │
 *   │  Signature line                                        │
 *   │  ───────────────────────────────────────────────────   │
 *   │  Dev credit footer                                     │
 *   └────────────────────────────────────────────────────────┘
 */
export async function generatePurchaseBillPDF(params: {
  purchase: Purchase;
  customer?: Customer | null;
  supplier?: Supplier | null;
  product?: Product | null;
  locationName?: string | null;
  generatedAt: string;
}): Promise<BillShareInfo> {
  const { purchase, customer, supplier, product, locationName, generatedAt } = params;
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { numberToRupeeWords } = await import("@/lib/number-to-words");

  // Pre-load Noto Nastaliq Urdu font so canvas rendering is ready
  // for product names that contain Urdu text.
  await ensureUrduFontLoaded();

  // Determine counterparty
  const isBuyFromCustomer = !!purchase.settled_by_customer_id;
  const counterpartyName = isBuyFromCustomer
    ? customer?.name ?? "N/A"
    : supplier?.name ?? "N/A";
  const counterpartyPhone = isBuyFromCustomer ? customer?.phone ?? "—" : "—";
  const counterpartyType = isBuyFromCustomer
    ? (customer?.type === "credit" ? "Credit Customer" : "Cash Customer")
    : "Supplier";

  // Computed amounts
  const qty = Number(purchase.quantity ?? 0);
  const rate = Number(purchase.rate_per_bag ?? 0);
  const totalAmount = qty * rate;
  const cashPaid = Number(purchase.cash_paid ?? 0);
  const pending = Math.max(0, totalAmount - cashPaid);
  const status: "Fully Paid" | "Partially Paid" | "Unpaid" =
    cashPaid >= totalAmount && totalAmount > 0
      ? "Fully Paid"
      : cashPaid > 0
        ? "Partially Paid"
        : "Unpaid";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 15;
  let y = m;

  /* ═══════ TOP GOLD LINE ═══════ */
  doc.setFillColor(...C_GOLD);
  doc.rect(0, 0, pw, 2.5, "F");

  /* ═══════ HEADER ═══════ */
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

  // Right: BILL label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...C_AMBER);
  doc.text("PURCHASE", pw - m, 13, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_GRAY);
  doc.text(
    isBuyFromCustomer ? "Goods Bought From Customer" : "Goods Bought From Supplier",
    pw - m,
    19,
    { align: "right" },
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_DARK);
  doc.text(`Bill #${purchase.id}`, pw - m, 25, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text(`Generated: ${generatedAt}`, pw - m, 29, { align: "right" });

  // Gold + green divider
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.8);
  doc.line(m, headerH, pw - m, headerH);
  doc.setLineWidth(0.2);
  doc.setDrawColor(...C_GREEN);
  doc.line(m, headerH + 1.2, pw - m, headerH + 1.2);

  y = headerH + 7;

  /* ═══════ TWO-COLUMN: Counterparty Info | Bill Summary (Unboxed) ═══════ */
  const colW = (pw - m * 2 - 12) / 2;
  const leftX = m;
  const rightX = m + colW + 12;

  // Left — Purchased From / Bought From
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_AMBER);
  doc.text(isBuyFromCustomer ? "BOUGHT FROM:" : "PURCHASED FROM:", leftX, y + 4);

  doc.setDrawColor(...C_AMBER);
  doc.setLineWidth(0.3);
  doc.line(leftX, y + 6, leftX + 38, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text("Name:", leftX, y + 12);
  doc.text("Phone:", leftX, y + 18);
  doc.text("Type:", leftX, y + 24);

  if (hasUrdu(counterpartyName)) {
    try {
      const partyImg = renderTextToImageDataUrl(counterpartyName, {
        fontSize: 9,
        bold: true,
        color: "#173337",
        scale: 3,
      });
      const MM_PER_PT = 0.353;
      doc.addImage(partyImg.dataUrl, "PNG", leftX + 22, y + 8.5, partyImg.widthPt * MM_PER_PT, partyImg.heightPt * MM_PER_PT);
    } catch {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...C_DARK);
      doc.text(sanitizeUrduForPdf(counterpartyName).slice(0, 26), leftX + 22, y + 12);
    }
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...C_DARK);
    doc.text(toTitleCase(counterpartyName).slice(0, 26), leftX + 22, y + 12);
  }
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(counterpartyPhone, leftX + 22, y + 18);
  doc.text(counterpartyType, leftX + 22, y + 24);

  // Right — Bill Summary
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_AMBER);
  doc.text("SUMMARY:", rightX, y + 4);

  doc.setDrawColor(...C_AMBER);
  doc.setLineWidth(0.3);
  doc.line(rightX, y + 6, rightX + 26, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_MUTED_GRAY);
  doc.text("Date:", rightX, y + 12);
  doc.text("Location:", rightX, y + 18);
  doc.text("Bill #:", rightX, y + 24);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C_DARK);
  doc.text(purchase.purchase_date || "—", rightX + 24, y + 12);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(locationName || "Farmhouse", rightX + 24, y + 18);
  doc.setFont("helvetica", "bold");
  doc.text(`#${purchase.id}`, rightX + 24, y + 24);

  y += 30;

  /* ═══════ ITEM TABLE ═══════ */
  const unitLabel = purchase.unit_type === "kg" ? "kg" : "bags";
  const bagWeight = purchase.bag_weight_kg ?? 50;
  const totalKg = purchase.unit_type === "kg"
    ? qty
    : qty * bagWeight;

  const productNameForCell = product?.name ?? `Product #${purchase.product_id}`;

  const tData = [[
    "1",
    productNameForCell,
    `${qty.toLocaleString("en-PK")} ${unitLabel}`,
    `${totalKg.toLocaleString("en-PK")} kg`,
    `Rs. ${rate.toLocaleString("en-PK")}`,
    `Rs. ${totalAmount.toLocaleString("en-PK")}`,
  ]];

  // ── Pre-render Product cell if it contains Urdu text ──
  // Product column is index 1. autoTable doesn't set an explicit cellWidth
  // for column 1 — it auto-sizes based on remaining space. We use a
  // reasonable estimate (50mm) for image wrapping; if the actual cell is
  // narrower, didDrawCell scales the image down to fit.
  const PUR_PRODUCT_COL_IDX = 1;
  const productCellImages = new Map<number, RenderedTextImage>();
  if (hasUrdu(productNameForCell)) {
    try {
      const image = renderMultilineTextToImageDataUrl(productNameForCell, {
        fontSize: 9.5,
        color: "#28323c",
        maxWidthPt: (50 - 5) * 2.835, // 50mm col − 5mm padding, in pt
        lineHeightPt: 9.5 * 1.15,
        scale: 3,
      });
      productCellImages.set(0, image); // only 1 row in purchase bill
    } catch (e) {
      console.warn("Purchase-bill Urdu cell image render failed:", e);
    }
  }

  autoTable(doc, {
    startY: y,
    head: [["#", "Product", "Qty (bags/kg)", "Total kg", "Rate / bag", "Amount"]],
    body: tData,
    foot: [["", "", "", "", "TOTAL", `Rs. ${totalAmount.toLocaleString("en-PK")}`]],
    theme: "grid",
    headStyles: {
      fillColor: C_AMBER,
      textColor: C_WHITE,
      fontStyle: "bold",
      fontSize: 9,
      halign: "center",
      lineColor: C_AMBER,
      lineWidth: 0.1,
      cellPadding: 3,
    },
    footStyles: {
      fillColor: C_GOLD_LIGHT,
      textColor: C_AMBER,
      fontStyle: "bold",
      fontSize: 10,
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 9.5,
      textColor: [40, 50, 60],
      lineColor: C_GRAY_LIGHT,
      cellPadding: 3,
    },
    // Clear text for Product cell if it has Urdu — render as image instead
    didParseCell: (hookData) => {
      if (
        hookData.section === "body" &&
        hookData.column.index === PUR_PRODUCT_COL_IDX &&
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
    didDrawCell: (hookData) => {
      if (
        hookData.section === "body" &&
        hookData.column.index === PUR_PRODUCT_COL_IDX &&
        productCellImages.has(hookData.row.index)
      ) {
        const image = productCellImages.get(hookData.row.index)!;
        const cell = hookData.cell;
        const padding = 3; // mm — matches bodyStyles.cellPadding
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
          console.warn("Purchase-bill Urdu image embed failed:", e);
        }
      }
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    margin: { left: m, right: m },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  /* ═══════ PAYMENT BREAKDOWN BOX (Total / Cash Paid / Pending / Status) ═══════ */
  const boxH = 26;
  doc.setFillColor(...C_GOLD_LIGHT);
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.3);
  doc.roundedRect(m, y, pw - m * 2, boxH, 1.5, 1.5, "FD");

  // Column dividers — 4 columns
  const colWidth = (pw - m * 2) / 4;
  const col1X = m + colWidth;
  const col2X = m + colWidth * 2;
  const col3X = m + colWidth * 3;
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.2);
  doc.line(col1X, y + 4, col1X, y + boxH - 4);
  doc.line(col2X, y + 4, col2X, y + boxH - 4);
  doc.line(col3X, y + 4, col3X, y + boxH - 4);

  const labelY = y + 9;
  const valueY = y + 17;
  const subY = y + 22;

  // Total Amount
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...C_AMBER);
  doc.text("TOTAL AMOUNT", m + colWidth / 2, labelY, { align: "center" });
  doc.setFontSize(11);
  doc.setTextColor(...C_DARK);
  doc.text(`Rs. ${totalAmount.toLocaleString("en-PK")}`, m + colWidth / 2, valueY, { align: "center" });

  // Cash Paid
  doc.setFontSize(7);
  doc.setTextColor(...C_AMBER);
  doc.text("CASH PAID", col1X + colWidth / 2, labelY, { align: "center" });
  doc.setFontSize(11);
  const cashPaidColor: [number, number, number] = cashPaid > 0 ? [20, 100, 60] : C_GRAY;
  doc.setTextColor(...cashPaidColor);
  doc.text(`Rs. ${cashPaid.toLocaleString("en-PK")}`, col1X + colWidth / 2, valueY, { align: "center" });

  // Pending
  doc.setFontSize(7);
  doc.setTextColor(...C_AMBER);
  doc.text("PENDING", col2X + colWidth / 2, labelY, { align: "center" });
  doc.setFontSize(11);
  const pendingColor: [number, number, number] = pending > 0 ? [200, 80, 30] : C_GRAY;
  doc.setTextColor(...pendingColor);
  doc.text(`Rs. ${pending.toLocaleString("en-PK")}`, col2X + colWidth / 2, valueY, { align: "center" });

  // Status
  doc.setFontSize(7);
  doc.setTextColor(...C_AMBER);
  doc.text("STATUS", col3X + colWidth / 2, labelY, { align: "center" });
  doc.setFontSize(10);
  const statusColor: [number, number, number] =
    status === "Fully Paid" ? [20, 100, 60] : status === "Partially Paid" ? [200, 80, 30] : [180, 60, 60];
  doc.setTextColor(...statusColor);
  doc.text(status, col3X + colWidth / 2, valueY, { align: "center" });

  // In-words sub-line
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...C_GRAY);
  doc.text(
    `Total in words: ${numberToRupeeWords(totalAmount)}`,
    m + 4,
    subY,
  );

  y += boxH + 6;

  /* ═══════ NOTES (optional) ═══════ */
  if (purchase.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...C_GREEN);
    doc.text("NOTES", m, y);
    y += 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C_DARK);
    const wrappedNotes = doc.splitTextToSize(purchase.notes, pw - m * 2);
    doc.text(wrappedNotes, m, y);
    y += wrappedNotes.length * 4 + 4;
  }

  /* ═══════ SIGNATURE LINE ═══════ */
  y = Math.max(y + 15, ph - 50);
  doc.setDrawColor(...C_GRAY_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(m, y, m + 60, y);
  doc.line(pw - m - 60, y, pw - m, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_GRAY);
  doc.text(
    isBuyFromCustomer ? "Customer Signature" : "Supplier Signature",
    m,
    y + 5,
  );
  doc.text("Authorized Signature", pw - m - 60, y + 5);

  /* ═══════ CLEAN FOOTER ═══════ */
  const footY = ph - 10;
  doc.setDrawColor(...C_GOLD);
  doc.setLineWidth(0.8);
  doc.line(m, footY, pw - m, footY);
  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.2);
  doc.line(m, footY + 1, pw - m, footY + 1);

  doc.setFillColor(...C_GOLD);
  doc.rect(0, ph - 2, pw, 2, "F");

  // Save
  const safeName = counterpartyName.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "");
  const fileName = `purchase-bill-${purchase.id}-${safeName}.pdf`;
  doc.save(fileName);

  // Return blob + caption so callers can offer WhatsApp sharing.
  const caption = buildPurchaseBillCaption({
    billId: purchase.id,
    counterpartyName,
    counterpartyType: counterpartyType,
    date: purchase.purchase_date || generatedAt,
    totalAmount,
    cashPaid,
    pending,
    status,
    productName: product?.name,
  });
  return {
    blob: doc.output("blob"),
    fileName,
    caption,
  };
}
