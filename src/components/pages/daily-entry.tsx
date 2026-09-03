"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useCartStore, fetchCached, invalidateCache, apiError } from "@/store";
import { PageHeader } from "@/components/shared/page-header";
import { QuickNav } from "@/components/shared/quick-nav";
import type { CartItem, Sale, Expense, Product, Customer, ProductStock, Location, CustomerPayment } from "@/types";
import { LocationSelect } from "@/components/shared/location-select";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShoppingCart,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  Package,
  ChevronDown,
  Receipt,
  TrendingDown,
  Loader2,
  Beaker,
  Truck,
  ChevronLeft,
  ChevronRight,
  Download,
  CalendarDays,
  Wallet,
  Pencil,
  FileText,
  Lock,
  DollarSign,
  Banknote,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import ConfirmAction from "@/components/shared/confirm-action";
import { AvailableStock } from "@/components/shared/available-stock";
import { pktToday } from "@/lib/pkt-date";
import { downloadExcel } from "@/lib/download-excel";
import { Checkbox } from "@/components/ui/checkbox";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateAfterCustomerPaymentMutation } from "@/hooks/queries";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const fmt = (n?: number | null) => (n === null || n === undefined || isNaN(Number(n)) ? "0" : Number(n).toLocaleString("en-PK"));

export default function DailyEntryPage() {
  const today = pktToday();
  const queryClient = useQueryClient();

  const { items: cartItems, addItem, removeItem, clearCart, getTotal: getCartTotal } = useCartStore();

  const [date, setDate] = useState(today);
  const [locationId, setLocationId] = useState<number>(2); // default to Shop
  const [unitChoice, setUnitChoice] = useState<"bags" | "kg">("bags");
  const [productId, setProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [bagWeight, setBagWeight] = useState<string>("50");
  const [rate, setRate] = useState<string>("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerType, setCustomerType] = useState<"credit" | "cash">("credit");
  const [rickshawFare, setRickshawFare] = useState<string>("0");
  const [rickshawDriver, setRickshawDriver] = useState("");
  const [cashReceived, setCashReceived] = useState<string>("0");
  // Opening balance — one-time previous balance the user enters manually
  // for the selected customer (instead of re-entering all historical sales).
  // Auto-fills with the customer's existing opening_balance when a known
  // customer is selected; editable so the user can update it on the fly.
  // Saved back to the customer record when the sale is completed.
  const [openingBalance, setOpeningBalance] = useState<string>("0");
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmount, setExpenseAmount] = useState<string>("");

  // ── Customer Payment panel state ──
  // Tracks: which customer is paying, how much, optional notes, saving state.
  const [cpCustomerId, setCpCustomerId] = useState<string>("");
  const [cpCustomerSearch, setCpCustomerSearch] = useState("");
  const [cpAmount, setCpAmount] = useState<string>("");
  const [cpNotes, setCpNotes] = useState("");
  const [savingCustomerPayment, setSavingCustomerPayment] = useState(false);

  // ── Today's Customer Payments: server-side pagination + customer-name search ──
  // Declared UP HERE (before loadCustomerPayments + the useEffect that uses them)
  // so we don't hit "used before declaration" TS errors.
  const CP_PAGE_SIZE = 10;
  const [cpSearchInput, setCpSearchInput] = useState("");
  const [cpSearchDebounced, setCpSearchDebounced] = useState("");
  const [cpPage, setCpPage] = useState(1);
  const [cpTotal, setCpTotal] = useState(0);
  const [cpTotalPages, setCpTotalPages] = useState(1);
  const [downloadingCpExcel, setDownloadingCpExcel] = useState(false);
  const [downloadingCpPdf, setDownloadingCpPdf] = useState(false);

  // ── Use Advance checkbox state (Complete Sale panel) ──
  // When true AND the selected customer has advance_payment > 0,
  // the sale's effective cash_received is bumped by min(advance, grandTotal)
  // and the customer's advance_payment is decremented after the sale.
  const [useAdvance, setUseAdvance] = useState(false);

  // Data from API
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stockData, setStockData] = useState<ProductStock[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);

  // ── Today's Sales: client-side search + optional page size (default: "all") ──
  const [salesSearchInput, setSalesSearchInput] = useState("");
  const [salesPageSize, setSalesPageSize] = useState<"all" | "25" | "50" | "100">("all");
  const [salesPage, setSalesPage] = useState(1);
  const [salesTotal, setSalesTotal] = useState(0);
  const [downloadingSalesExcel, setDownloadingSalesExcel] = useState(false);
  const [downloadingSalesPdf, setDownloadingSalesPdf] = useState(false);
  const [downloadingDaySummaryPdf, setDownloadingDaySummaryPdf] = useState(false);
  // Location filter for Today's Sales — 0 = All Locations (default), 1 = Farmhouse, 2 = Shop
  const [salesLocationFilter, setSalesLocationFilter] = useState<number>(0);
  // Cached locations list for rendering location badges on each sale row
  // (cheaper than re-querying per row).
  const [locationsList, setLocationsList] = useState<{id: number; name: string}[]>([]);

  // Bumped after every successful sale / mix-order / expense delete so the
  // <AvailableStock> panel knows to refetch stock automatically.
  const [stockRefreshTrigger, setStockRefreshTrigger] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingSale, setSavingSale] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);

  // Confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmDesc, setConfirmDesc] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);
  const askConfirm = (t: string, d: string, a: () => void) => { setConfirmTitle(t); setConfirmDesc(d); setConfirmAction(() => a); setConfirmOpen(true); };

  // ── Edit Sale dialog state ──
  // When user clicks the pencil icon on a regular sale row, this dialog opens
  // with that sale's current values pre-filled. On Save → PUT /api/sales.
  const [editSaleOpen, setEditSaleOpen] = useState(false);
  const [editSaleTarget, setEditSaleTarget] = useState<Sale | null>(null);
  const [savingEditSale, setSavingEditSale] = useState(false);

  const handleEditSale = (sale: Sale) => {
    setEditSaleTarget(sale);
    setEditSaleOpen(true);
  };

  const handleSaveEditSale = async (patch: {
    id: number;
    customer_id: number;
    product_id: number;
    location_id: number | null;
    quantity: number;
    rate_per_bag: number;
    rickshaw_fare: number;
    rickshaw_driver_name: string | null;
    cash_received: number;
    sale_date: string;
    unit_type: "bags" | "kg";
    bag_weight_kg: number | null;
  }) => {
    setSavingEditSale(true);
    try {
      const res = await fetch("/api/sales", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to update sale");
      }
      toast.success(`Sale #${patch.id} update ho gaya`);
      setEditSaleOpen(false);
      setEditSaleTarget(null);
      // Refresh the day's data so the table shows updated values.
      await loadDayData(date, salesLocationFilter);
      invalidateCache("stock");
      invalidateCache("customers");
      setStockRefreshTrigger((n) => n + 1);
    } catch (e: any) {
      toast.error(e.message || "Update nahi hua");
    } finally {
      setSavingEditSale(false);
    }
  };

  const loadMasterData = useCallback(async () => {
    // Run all 3 master-data fetches IN PARALLEL.
    // Previously these were 3 sequential try/catch blocks — each one waited
    // for the previous to finish before starting, which added ~200-600ms of
    // unnecessary latency per page load (3 API calls in
    // sequence instead of in parallel).
    const errors: string[] = [];
    const [pRes, cRes, sRes, locRes] = await Promise.allSettled([
      fetchCached<Product>("products", "/api/products?active=true", "products"),
      fetchCached<Customer>("customers", "/api/customers?active=true", "customers"),
      fetchCached<ProductStock>("stock", "/api/stock", "stock"),
      // Fetch locations list (Shop / Farmhouse) for rendering location badges on
      // each sale row. Best-effort — UI still works if this fails (badge just
      // shows the numeric id).
      fetch("/api/locations", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : null
      ).catch(() => null),
    ]);
    if (pRes.status === "fulfilled") setProducts(pRes.value);
    else errors.push("Products");
    if (cRes.status === "fulfilled") setCustomers(cRes.value);
    else errors.push("Customers");
    if (sRes.status === "fulfilled") setStockData(sRes.value);
    else errors.push("Stock");
    if (locRes.status === "fulfilled" && locRes.value && Array.isArray(locRes.value.locations)) {
      setLocationsList(locRes.value.locations);
    }
    if (errors.length > 0) toast.error(`Failed to load: ${errors.join(", ")}`);
  }, []);

  const loadDayData = useCallback(async (d: string, locationFilter: number = 0) => {
    const bust = `_t=${Date.now()}`;
    try {
      const params = new URLSearchParams({ sale_date: d, _t: bust, pageSize: "all" });
      // 0 = All Locations (don't send location_id), 1/2 = specific location filter
      if (locationFilter && locationFilter > 0) params.set("location_id", String(locationFilter));
      const sRes = await fetch(`/api/sales?${params.toString()}`);
      if (sRes.ok) {
        const sData = await sRes.json();
        const rows = Array.isArray(sData.sales) ? sData.sales : [];
        setSales(rows);
        setSalesTotal(typeof sData.total === "number" ? sData.total : rows.length);
      }
      else toast.error("Failed to load sales");
    } catch { toast.error("Failed to load sales"); }
    try {
      const eRes = await fetch(`/api/expenses?expense_date=${d}&${bust}`);
      if (eRes.ok) { const eData = await eRes.json(); setExpenses(eData.expenses ?? []); }
      else toast.error("Failed to load expenses");
    } catch { toast.error("Failed to load expenses"); }
  }, []);

  // Separate loader for customer payments (server-side paginated).
  // Kept separate from loadDayData so it can be re-triggered independently
  // when only the payments list needs to refresh (e.g. after adding a payment).
  const loadCustomerPayments = useCallback(async (d: string, customerName = "", page = 1) => {
    try {
      const params = new URLSearchParams({ payment_date: d, date: d });
      if (customerName.trim()) params.set("customer_name", customerName.trim());
      params.set("page", String(page));
      params.set("pageSize", String(CP_PAGE_SIZE));
      const res = await fetch(`/api/customer-payments?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.rows)
          ? data.rows
          : Array.isArray(data.payments)
          ? data.payments
          : [];
        setCustomerPayments(list);
        setCpTotal(typeof data.total === "number" ? data.total : list.length);
        setCpTotalPages(typeof data.totalPages === "number" ? data.totalPages : 1);
      } else {
        // Show empty list so UI doesn't crash.
        setCustomerPayments([]);
        setCpTotal(0);
        setCpTotalPages(1);
      }
    } catch {
      setCustomerPayments([]);
      setCpTotal(0);
      setCpTotalPages(1);
    }
  }, [CP_PAGE_SIZE]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.allSettled([
        loadMasterData(),
        loadDayData(date),
        loadCustomerPayments(date),
      ]);
      setLoading(false);
    })();
  }, []);

  // Refetch sales when date or location filter changes
  useEffect(() => {
    loadDayData(date, salesLocationFilter);
  }, [date, salesLocationFilter, loadDayData]);

  // Refetch customer payments when date, search, or page changes
  useEffect(() => {
    loadCustomerPayments(date, cpSearchDebounced, cpPage);
  }, [date, cpSearchDebounced, cpPage, loadCustomerPayments]);

  // ── Download ALL sales for the current date as Excel ──
  // Walks pages server-side so we get every sale record for the date,
  // regardless of the current search filter (search filter is for finding
  // records, not for limiting the export).
  const handleDownloadSalesExcel = async () => {
    setDownloadingSalesExcel(true);
    try {
      const all: Record<string, any>[] = [];
      let page = 1;
      let totalPages = 1;
      const pageSize = 200;
      while (page <= totalPages) {
        const qs = new URLSearchParams({
          sale_date: date,
          page: String(page),
          pageSize: String(pageSize),
        });
        const res = await fetch(`/api/sales?${qs.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch sales");
        const body = await res.json();
        const rows: any[] = Array.isArray(body?.sales) ? body.sales : [];
        all.push(...rows);
        totalPages = typeof body?.totalPages === "number" ? body.totalPages : 1;
        if (rows.length === 0) break;
        page += 1;
      }
      if (all.length === 0) {
        toast.error("No sales to download for this date");
        return;
      }
      await downloadExcel(all, [
        { key: "sale_date", label: "Date" },
        {
          key: "customers",
          label: "Customer",
          fmt: (v: any) => v?.name ?? "—",
        },
        {
          key: "products",
          label: "Product",
          fmt: (v: any) => v?.name ?? "—",
        },
        { key: "quantity", label: "Qty", align: "right" },
        { key: "unit_type", label: "Unit" },
        { key: "rate_per_bag", label: "Rate", align: "right" },
        { key: "rickshaw_fare", label: "Rickshaw", align: "right" },
        {
          key: "_bill",
          label: "Bill",
          align: "right",
          fmt: (_v: any, row: any) =>
            String(
              (Number(row.quantity) || 0) * (Number(row.rate_per_bag) || 0) +
                (Number(row.rickshaw_fare) || 0),
            ),
        },
        { key: "cash_received", label: "Cash", align: "right" },
        {
          key: "_remaining",
          label: "Remaining",
          align: "right",
          fmt: (_v: any, row: any) =>
            String(
              (Number(row.quantity) || 0) * (Number(row.rate_per_bag) || 0) +
                (Number(row.rickshaw_fare) || 0) -
                (Number(row.cash_received) || 0),
            ),
        },
        { key: "rickshaw_driver_name", label: "Rickshaw Driver" },
        { key: "entered_by", label: "Entered By" },
        { key: "mix_order_id", label: "Mix Order ID" },
      ], `sales-${date}`);
      toast.success(`Sales Excel downloaded (${all.length} records)`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to download Excel");
    } finally {
      setDownloadingSalesExcel(false);
    }
  };

  // ── Download ALL sales for the current date as PDF Report ──
  const handleDownloadSalesPdf = async () => {
    setDownloadingSalesPdf(true);
    try {
      toast.loading("Generating Sales PDF Report…", { id: "pdf-sales-dl" });
      const all: Record<string, any>[] = [];
      let page = 1;
      let totalPages = 1;
      const pageSize = 200;
      while (page <= totalPages) {
        const qs = new URLSearchParams({
          sale_date: date,
          page: String(page),
          pageSize: String(pageSize),
        });
        if (salesLocationFilter > 0) {
          qs.set("location_id", String(salesLocationFilter));
        }
        const res = await fetch(`/api/sales?${qs.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch sales");
        const body = await res.json();
        const rows: any[] = Array.isArray(body?.sales) ? body.sales : [];
        all.push(...rows);
        totalPages = typeof body?.totalPages === "number" ? body.totalPages : 1;
        if (rows.length === 0) break;
        page += 1;
      }
      if (all.length === 0) {
        toast.error("No sales to download for this date", { id: "pdf-sales-dl" });
        return;
      }

      const locObj = locationsList.find((l) => l.id === salesLocationFilter);
      const locLabel = salesLocationFilter > 0 ? (locObj?.name || (salesLocationFilter === 1 ? "Farmhouse" : "Shop")) : "All Locations";

      const { generateSalesReportPDF } = await import("@/lib/generate-report-pdf");
      await generateSalesReportPDF({
        sales: all,
        date,
        locationName: locLabel,
      });
      toast.success(`Sales PDF downloaded (${all.length} records)`, { id: "pdf-sales-dl" });
    } catch (e: any) {
      toast.error(e?.message || "Failed to download Sales PDF", { id: "pdf-sales-dl" });
    } finally {
      setDownloadingSalesPdf(false);
    }
  };

  // ── Download Complete Day-End Supervisor Summary Report (PDF) ──
  const handleDownloadDaySummaryPdf = async () => {
    setDownloadingDaySummaryPdf(true);
    try {
      toast.loading("Generating Complete Day-End Supervisor Summary…", { id: "pdf-day-summary-dl" });

      // 1. Fetch all sales for this date
      const allSales: any[] = [];
      let sPage = 1;
      let sTotalPages = 1;
      while (sPage <= sTotalPages) {
        const qs = new URLSearchParams({ sale_date: date, page: String(sPage), pageSize: "200" });
        const res = await fetch(`/api/sales?${qs.toString()}`);
        if (res.ok) {
          const body = await res.json();
          const rows = Array.isArray(body?.sales) ? body.sales : [];
          allSales.push(...rows);
          sTotalPages = body?.totalPages || 1;
          if (rows.length === 0) break;
        } else {
          break;
        }
        sPage += 1;
      }

      // 2. Fetch all customer payments for this date
      const allPayments: any[] = [];
      let cpP = 1;
      let cpTotalP = 1;
      while (cpP <= cpTotalP) {
        const qs = new URLSearchParams({ payment_date: date, page: String(cpP), pageSize: "200" });
        const res = await fetch(`/api/customer-payments?${qs.toString()}`);
        if (res.ok) {
          const body = await res.json();
          const rows = Array.isArray(body?.rows) ? body.rows : [];
          allPayments.push(...rows);
          cpTotalP = body?.totalPages || 1;
          if (rows.length === 0) break;
        } else {
          break;
        }
        cpP += 1;
      }

      // 3. Fetch purchases
      let allPurchases: any[] = [];
      try {
        const pRes = await fetch("/api/purchases");
        if (pRes.ok) {
          const pBody = await pRes.json();
          allPurchases = Array.isArray(pBody?.purchases) ? pBody.purchases : [];
        }
      } catch {
        // purchases optional fallback
      }

      const { generateDayEndSupervisorSummaryPDF } = await import("@/lib/generate-report-pdf");
      await generateDayEndSupervisorSummaryPDF({
        date,
        sales: allSales,
        expenses: expenses,
        customerPayments: allPayments,
        purchases: allPurchases,
      });

      toast.success(`Supervisor Day Summary PDF generated for ${date}!`, { id: "pdf-day-summary-dl" });
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate Supervisor summary", { id: "pdf-day-summary-dl" });
    } finally {
      setDownloadingDaySummaryPdf(false);
    }
  };

  const selectedProduct = products.find((p) => String(p.id) === productId);

  // Find stock for the selected product AT THE SELECTED LOCATION.
  // Falls back to 0 if no stock row exists at that location.
  const stockEntry = stockData.find(
    (s) => Number(s.product_id) === Number(productId) && Number(s.location_id) === Number(locationId)
  );
  const stockBags = stockEntry?.stock_quantity ?? (selectedProduct as any)?.stock_quantity ?? 0;

  const defaultRate = selectedProduct?.default_rate ?? 0;
  const quantityNum = parseFloat(quantity) || 0;
  const bagWeightNum = parseFloat(bagWeight) || 50;
  const rateNum = parseFloat(rate) || 0;
  const lineAmount = quantityNum * rateNum;

  const cartTotal = getCartTotal();
  const rickshawNum = parseFloat(rickshawFare) || 0;
  const grandTotal = cartTotal + rickshawNum;

  const unitType = unitChoice;

  const filteredCustomers = useMemo(() => {
    const base = customers.filter(
      (c) => c.is_active && c.name.toLowerCase() !== "walk-in cash customer"
    );
    if (!customerSearch.trim()) return base;
    const q = customerSearch.toLowerCase();
    return base.filter((c) => c.name.toLowerCase().includes(q));
  }, [customerSearch, customers]);

  // ── Auto-lock Cash Received to exact Bill Amount for Cash Customers ──
  useEffect(() => {
    if (customerType === "cash") {
      setCashReceived(String(grandTotal));
    }
  }, [customerType, grandTotal]);

  const handleCustomerTypeChange = (type: "credit" | "cash") => {
    setCustomerType(type);
    if (type === "cash") {
      setOpeningBalance("0");
      setUseAdvance(false);
      setCashReceived(String(grandTotal));
      setSelectedCustomerId("");
    } else {
      setCashReceived("0");
      if (selectedCustomerId) {
        const c = customers.find((x) => String(x.id) === selectedCustomerId);
        if (c) {
          setOpeningBalance(String(c.opening_balance ?? 0));
        }
      }
    }
  };

  // ── Track whether the OB input differs from the customer's saved value ──
  // Used to show a "Modified" badge + confirm to the user that the saved
  // opening_balance will be overwritten when the sale is completed.
  const savedOpeningBalance = useMemo(() => {
    if (!selectedCustomerId) return null;
    const c = customers.find((x) => String(x.id) === selectedCustomerId);
    return c ? c.opening_balance ?? 0 : null;
  }, [selectedCustomerId, customers]);

  // ── Selected customer's advance_payment (for the "Use advance" checkbox) ──
  // Used to:
  //   1. Show the customer's current advance balance next to the sale form
  //   2. Decide whether to display the "Use advance" checkbox
  //   3. Compute how much of the advance will actually be applied
  //      (= min(advance_payment, grandTotal))
  const selectedCustomerAdvance = useMemo(() => {
    if (!selectedCustomerId) return 0;
    const c = customers.find((x) => String(x.id) === selectedCustomerId);
    return c ? Number(c.advance_payment ?? 0) : 0;
  }, [selectedCustomerId, customers]);

  // Effective advance to apply when "Use advance" is checked.
  // Capped at the sale's grand total — can't apply more advance than the bill.
  const appliedAdvance = useMemo(() => {
    if (!useAdvance) return 0;
    return Math.min(selectedCustomerAdvance, grandTotal);
  }, [useAdvance, selectedCustomerAdvance, grandTotal]);

  const obModified = useMemo(() => {
    if (savedOpeningBalance === null) return false;
    const current = parseFloat(openingBalance) || 0;
    return Math.abs(current - savedOpeningBalance) > 0.001;
  }, [openingBalance, savedOpeningBalance]);

  const handleCustomerSelect = (id: string) => {
    setSelectedCustomerId(id);
    const c = customers.find((x) => String(x.id) === id);
    if (c) {
      setCustomerName(c.name);
      setCustomerType(c.type as "credit" | "cash");
      // Auto-fill opening balance from the customer's existing record
      // (defaults to 0 if they don't have one set yet).
      setOpeningBalance(String(c.opening_balance ?? 0));
      // Reset "Use advance" — new customer may not have advance balance.
      setUseAdvance(false);
    }
  };

  const handleProductChange = (id: string) => {
    setProductId(id);
    const p = products.find((x) => String(x.id) === id);
    if (p) setRate(String(p.default_rate));
  };

  const handleAddToCart = () => {
    if (!selectedProduct) return;
    if (quantityNum <= 0) {
      toast.error("Quantity must be greater than 0.");
      return;
    }
    if (unitChoice === "bags" && bagWeightNum <= 0) {
      toast.error("Please enter a valid bag weight.");
      return;
    }
    const item: CartItem = {
      product: selectedProduct.name,
      product_id: selectedProduct.id,
      location: null,
      location_id: locationId,
      quantity: quantityNum,
      unit_type: unitChoice,
      bag_weight_kg: unitChoice === "bags" ? bagWeightNum : null,
      rate: rateNum,
      amount: lineAmount,
    };
    addItem(item);
    setQuantity("");
    setRate(String(selectedProduct.default_rate));
    toast.success(`Added ${fmt(quantityNum)} ${unitChoice === "bags" ? "bag(s)" : "kg"} of ${selectedProduct.name}`);
  };

  const handleCompleteSale = async () => {
    const isCash = customerType === "cash";
    const displayName = customerName.trim() || (isCash ? "Walk-in Cash Customer" : "");

    if (!isCash && !displayName) {
      toast.error("Please enter or select a credit customer name for Khata.");
      return;
    }
    if (cartItems.length === 0) {
      toast.error("Cart is empty — add at least one product first.");
      return;
    }

    setSavingSale(true);
    try {
      let customerId: number | null = null;
      let obWasUpdated = false;
      let obOldValue = 0;
      let obNewValue = 0;
      let existingCustName = displayName;

      if (isCash) {
        // ZERO KHATA POLLUTION:
        // Do NOT insert into `customers` table.
        // Do NOT update opening_balance.
        // Do NOT apply advance.
        // Link to the static "Walk-in Cash Customer" row.
        const walkIn = customers.find(
          (c) => c.name.toLowerCase() === "walk-in cash customer"
        );
        if (walkIn) {
          customerId = walkIn.id;
        }
      } else {
        // Parse opening balance — defaults to 0 if blank/invalid
        const obNum = Math.max(0, parseFloat(openingBalance) || 0);

        // Find or create credit customer
        const existing = customers.find(
          (c) => c.name.toLowerCase() === displayName.toLowerCase()
        );
        if (existing) {
          customerId = existing.id;
          existingCustName = existing.name;
          obOldValue = existing.opening_balance ?? 0;
          obNewValue = obNum;
          if (Math.abs(obNum - obOldValue) > 0.001) {
            try {
              const upRes = await fetch("/api/customers", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: customerId, opening_balance: obNum }),
              });
              if (upRes.ok) {
                obWasUpdated = true;
                setCustomers((prev) =>
                  prev.map((c) => (c.id === customerId ? { ...c, opening_balance: obNum } : c))
                );
              }
            } catch {
              console.warn("Failed to update opening balance for customer", customerId);
            }
          }
        } else {
          const res = await fetch("/api/customers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: displayName,
              type: "credit",
              opening_balance: obNum,
            }),
          });
          if (!res.ok) throw new Error(await apiError(res, "Failed to create customer"));
          const data = await res.json();
          customerId = data.customer?.id;
          if (data.customer) setCustomers((prev) => [...prev, data.customer]);
        }
      }

      const items = cartItems.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        rate_per_bag: item.rate,
        unit_type: item.unit_type,
        bag_weight_kg: item.bag_weight_kg,
      }));

      // For cash sales: cash received is strictly 100% of grandTotal.
      // For credit sales: whatever was entered + applied advance.
      const effectiveCashReceived = isCash
        ? grandTotal
        : (Number(cashReceived) || 0) + (useAdvance ? appliedAdvance : 0);

      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          customer_id: customerId,
          customer_type: customerType,
          customer_name: displayName,
          location_id: locationId,
          sale_date: date,
          cash_received: effectiveCashReceived,
          rickshaw_fare: rickshawNum,
          rickshaw_driver: rickshawDriver || null,
          apply_advance: isCash ? 0 : (useAdvance ? appliedAdvance : 0),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to complete sale");
      }
      const saleResp = await res.json().catch(() => ({}));
      const advanceConsumed = Number(saleResp?.advance_consumed ?? (isCash ? 0 : appliedAdvance));

      clearCart();
      setRickshawFare("0");
      setRickshawDriver("");
      setCashReceived("0");
      setOpeningBalance("0");
      setCustomerName("");
      setSelectedCustomerId("");
      setUseAdvance(false);

      const advanceDesc = advanceConsumed > 0
        ? ` · Advance used: Rs. ${fmt(advanceConsumed)}`
        : "";
      if (obWasUpdated) {
        toast.success(`Sale completed for ${displayName} — Rs. ${fmt(grandTotal)} total bill.`, {
          description: `Opening balance OVERWRITTEN: Rs. ${fmt(obOldValue)} → Rs. ${fmt(obNewValue)} for ${existingCustName}.${advanceDesc}`,
          duration: 6000,
        });
      } else {
        toast.success(`Sale completed for ${displayName} — Rs. ${fmt(grandTotal)} total bill.${advanceDesc}`);
      }
      invalidateCache("stock");
      if (!isCash) {
        invalidateCache("customers");
      }
      await Promise.all([loadDayData(date), loadMasterData(), loadCustomerPayments(date)]);
      setStockRefreshTrigger((n) => n + 1);
    } catch (e: any) {
      toast.error(e.message || "Failed to complete sale");
    } finally {
      setSavingSale(false);
    }
  };

  const handleDeleteSale = (saleId: number) => {
    askConfirm("Delete Sale", `Sale #${saleId} ko database se permanently delete karna hai?`, async () => {
      setConfirmLoading(true);
      try {
        const res = await fetch(`/api/sales?id=${saleId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await apiError(res, "Failed"));
        setSales((prev) => prev.filter((s) => s.id !== saleId));
        toast.success("Sale #" + saleId + " delete ho gaya");
        // Stock is restored when a sale is deleted — refresh the panel.
        invalidateCache("stock");
        setStockRefreshTrigger((n) => n + 1);
      } catch (e: any) { toast.error(e.message || "Database me delete nahi hua"); }
      finally { setConfirmLoading(false); setConfirmOpen(false); }
    });
  };

  const handleDeleteMixOrder = (mixOrderId: string) => {
    // mixOrderId is now String(mix_order_id) from the group key
    const dbMixOrderId = Number(mixOrderId);

    askConfirm("Delete Mix Order", `Mix Order #${mixOrderId} ko database se delete karna hai?`, async () => {
      setConfirmLoading(true);
      try {
        // Use /api/mix-orders DELETE — cleans both sales and order records
        const res = await fetch(`/api/mix-orders?id=${dbMixOrderId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await apiError(res, "Failed"));
        // Remove only this mix order's sales from local state
        setSales((prev) => prev.filter((s) => String(s.mix_order_id) !== mixOrderId));
        toast.success("Mix Order #" + mixOrderId + " delete ho gaya");
        // Stock is restored when a mix order is deleted — refresh the panel.
        invalidateCache("stock");
        setStockRefreshTrigger((n) => n + 1);
      } catch (e: any) { toast.error(e.message || "Database me delete nahi hua"); }
      finally { setConfirmLoading(false); setConfirmOpen(false); }
    });
  };

  const handleAddExpense = async () => {
    if (!expenseDesc.trim()) {
      toast.error("Please enter a description.");
      return;
    }
    const amt = parseFloat(expenseAmount) || 0;
    if (amt <= 0) {
      toast.error("Amount must be greater than 0.");
      return;
    }
    setSavingExpense(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: expenseDesc.trim(),
          amount: amt,
          expense_date: date,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to add expense");
      }
      setExpenseDesc("");
      setExpenseAmount("");
      toast.success(`Added expense: ${expenseDesc} — Rs. ${fmt(amt)}`);
      await loadDayData(date);
    } catch (e: any) {
      toast.error(e.message || "Failed to add expense");
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = (expId: number) => {
    askConfirm("Delete Expense", `Expense #${expId} ko database se permanently delete karna hai?`, async () => {
      setConfirmLoading(true);
      try {
        const res = await fetch(`/api/expenses?id=${expId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await apiError(res, "Failed"));
        setExpenses((prev) => prev.filter((e) => e.id !== expId));
        toast.success("Expense #" + expId + " delete ho gaya");
      } catch (e: any) { toast.error(e.message || "Database me delete nahi hua"); }
      finally { setConfirmLoading(false); setConfirmOpen(false); }
    });
  };

  // ──────────────────────────────────────────────────────────
  // CUSTOMER PAYMENT handlers
  //
  // A "customer payment" = money a customer hands over WITHOUT buying
  // anything (e.g. a farmhouse customer comes, gives cash, and leaves).
  //
  // Logic (server-side, atomic via record_customer_payment RPC):
  //   1. If the customer has outstanding debt (balance_due > 0), the
  //      payment first reduces the debt (lowers customer.opening_balance).
  //   2. Any excess over the debt becomes customer.advance_payment.
  //      If the customer has NO debt at all, the FULL amount becomes
  //      advance_payment (this is the "cash customer gives money and
  //      leaves without buying" case).
  //   3. A history row is inserted into customer_payments with full
  //      before/after snapshot.
  //
  // The advance_payment can later be auto-consumed when the customer
  // buys something (Complete Sale panel → "Use advance payment" checkbox).
  // ──────────────────────────────────────────────────────────

  const handleSaveCustomerPayment = async () => {
    // Validate customer + amount
    if (!cpCustomerId) {
      toast.error("Pehle customer select karein.");
      return;
    }
    const amt = parseFloat(cpAmount) || 0;
    if (amt <= 0) {
      toast.error("Amount 0 se zyada hona chahiye.");
      return;
    }
    setSavingCustomerPayment(true);
    try {
      const res = await fetch("/api/customer-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: Number(cpCustomerId),
          amount: amt,
          payment_date: date,
          date: date,
          location_id: salesLocationFilter > 0 ? salesLocationFilter : 2,
          location: salesLocationFilter === 1 ? "Farm" : "Shop",
          payment_method: "Cash",
          notes: cpNotes.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to save payment");
      }
      const data = await res.json().catch(() => ({}));
      const newId = data?.payment?.id || data?.id;

      // Clear the form
      setCpCustomerId("");
      setCpCustomerSearch("");
      setCpAmount("");
      setCpNotes("");

      // Refresh customers list (advance_payment / opening_balance changed)
      // + customer payments history + master data
      setCpPage(1);
      invalidateCache("customers");
      invalidateAfterCustomerPaymentMutation(queryClient);
      await Promise.all([
        loadMasterData(),
        loadCustomerPayments(date, "", 1),
      ]);

      // Compose a helpful toast — tell the user how the payment was split
      // (we don't get the split back from the API directly, but we can
      // re-derive it client-side from the customer's NEW values vs. what
      // we know was the previous state). For simplicity we just toast the
      // amount + customer name.
      const cust = customers.find((c) => String(c.id) === String(cpCustomerId));
      toast.success(
        `Rs. ${fmt(amt)} payment saved for ${cust?.name ?? "customer"}.`,
        {
          description:
            "Agar customer ka udhaar tha to pehle us se minus hua, bacha hua amount advance payment me chala gaya.",
          duration: 6000,
        },
      );
      void newId;
    } catch (e: any) {
      toast.error(e.message || "Failed to save payment");
    } finally {
      setSavingCustomerPayment(false);
    }
  };

  const handleDeleteCustomerPayment = (paymentId: number) => {
    askConfirm(
      "Delete Payment",
      `Payment #${paymentId} ko delete karna hai? Customer ka opening_balance aur advance_payment dono reverse ho jayenge.`,
      async () => {
        setConfirmLoading(true);
        try {
          const res = await fetch(`/api/customer-payments?id=${paymentId}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error(await apiError(res, "Failed"));
          // Refresh customer payments history + customers list
          invalidateCache("customers");
          await Promise.all([
            loadMasterData(),
            loadCustomerPayments(date, cpSearchDebounced, cpPage),
          ]);
          toast.success("Payment #" + paymentId + " delete ho gaya");
        } catch (e: any) {
          toast.error(e.message || "Database me delete nahi hua");
        } finally {
          setConfirmLoading(false);
          setConfirmOpen(false);
        }
      },
    );
  };

  // Download ALL customer payments for the current date as Excel.
  // Walks pages server-side so we get every payment record for the date,
  // regardless of the current search filter.
  const handleDownloadCpExcel = async () => {
    setDownloadingCpExcel(true);
    try {
      const all: Record<string, any>[] = [];
      let page = 1;
      let totalPages = 1;
      const pageSize = 200;
      while (page <= totalPages) {
        const qs = new URLSearchParams({
          payment_date: date,
          page: String(page),
          pageSize: String(pageSize),
        });
        const res = await fetch(`/api/customer-payments?${qs.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch customer payments");
        const body = await res.json();
        const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
        all.push(...rows);
        totalPages = typeof body?.totalPages === "number" ? body.totalPages : 1;
        if (rows.length === 0) break;
        page += 1;
      }
      if (all.length === 0) {
        toast.error("No customer payments to download for this date");
        return;
      }
      await downloadExcel(all, [
        { key: "payment_date", label: "Date" },
        {
          key: "customers",
          label: "Customer",
          fmt: (v: any) => v?.name ?? "—",
        },
        {
          key: "customers",
          label: "Type",
          fmt: (v: any) => v?.type ?? "—",
        },
        { key: "amount", label: "Amount Paid", align: "right" },
        { key: "applied_to_opening", label: "Applied to Debt", align: "right" },
        { key: "applied_to_advance", label: "Added to Advance", align: "right" },
        { key: "opening_balance_before", label: "OB Before", align: "right" },
        { key: "opening_balance_after", label: "OB After", align: "right" },
        { key: "advance_before", label: "Advance Before", align: "right" },
        { key: "advance_after", label: "Advance After", align: "right" },
        { key: "notes", label: "Notes" },
        { key: "entered_by", label: "Entered By" },
      ], `customer-payments-${date}`);
      toast.success(`Customer payments Excel downloaded (${all.length} records)`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to download Excel");
    } finally {
      setDownloadingCpExcel(false);
    }
  };

  // Download ALL customer payments for the current date as PDF Report
  const handleDownloadCpPdf = async () => {
    setDownloadingCpPdf(true);
    try {
      toast.loading("Generating Customer Payments PDF…", { id: "pdf-cp-dl" });
      const all: Record<string, any>[] = [];
      let page = 1;
      let totalPages = 1;
      const pageSize = 200;
      while (page <= totalPages) {
        const qs = new URLSearchParams({
          payment_date: date,
          page: String(page),
          pageSize: String(pageSize),
        });
        const res = await fetch(`/api/customer-payments?${qs.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch customer payments");
        const body = await res.json();
        const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
        all.push(...rows);
        totalPages = typeof body?.totalPages === "number" ? body.totalPages : 1;
        if (rows.length === 0) break;
        page += 1;
      }
      if (all.length === 0) {
        toast.error("No customer payments to download for this date", { id: "pdf-cp-dl" });
        return;
      }

      const { generateCustomerPaymentsReportPDF } = await import("@/lib/generate-report-pdf");
      await generateCustomerPaymentsReportPDF({
        payments: all,
        date,
      });
      toast.success(`Customer Payments PDF downloaded (${all.length} records)`, { id: "pdf-cp-dl" });
    } catch (e: any) {
      toast.error(e?.message || "Failed to download PDF", { id: "pdf-cp-dl" });
    } finally {
      setDownloadingCpPdf(false);
    }
  };

  // Filter sales by customer name or product name or rickshaw driver
  const filteredSales = useMemo(() => {
    if (!salesSearchInput.trim()) return sales;
    const q = salesSearchInput.toLowerCase().trim();
    return sales.filter((s) => {
      const custName = (s.customers?.name || "").toLowerCase();
      const prodName = (s.products?.name || "").toLowerCase();
      const driver = (s.rickshaw_driver_name || "").toLowerCase();
      return custName.includes(q) || prodName.includes(q) || driver.includes(q);
    });
  }, [sales, salesSearchInput]);

  const regularSales = useMemo(() => filteredSales.filter((s) => !s.mix_order_id), [filteredSales]);
  const mixSales = useMemo(() => filteredSales.filter((s) => !!s.mix_order_id), [filteredSales]);

  const regularSalesTotalPages = useMemo(() => {
    if (salesPageSize === "all") return 1;
    const size = Number(salesPageSize) || 25;
    return Math.max(1, Math.ceil(regularSales.length / size));
  }, [regularSales.length, salesPageSize]);

  const pagedRegularSales = useMemo(() => {
    if (salesPageSize === "all") return regularSales;
    const size = Number(salesPageSize) || 25;
    const start = (salesPage - 1) * size;
    return regularSales.slice(start, start + size);
  }, [regularSales, salesPageSize, salesPage]);

  const mixGroups = useMemo(() => {
    // Group by mix_order_id (DB foreign key — unique per mix order)
    const map = new Map<string, Sale[]>();
    for (const s of mixSales) {
      const key = s.mix_order_id != null ? String(s.mix_order_id) : `mix-${s.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [mixSales]);

  // Aggregated totals for regular sales table footer
  const totalRegularQty = useMemo(
    () => regularSales.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0),
    [regularSales],
  );
  const totalRegularRickshaw = useMemo(
    () => regularSales.reduce((sum, s) => sum + (Number(s.rickshaw_fare) || 0), 0),
    [regularSales],
  );
  const totalRegularBill = useMemo(
    () =>
      regularSales.reduce(
        (sum, s) =>
          sum +
          (Number(s.quantity) || 0) * (Number(s.rate_per_bag) || 0) +
          (Number(s.rickshaw_fare) || 0),
        0,
      ),
    [regularSales],
  );
  const totalRegularCash = useMemo(
    () => regularSales.reduce((sum, s) => sum + (Number(s.cash_received) || 0), 0),
    [regularSales],
  );
  const totalRegularRemaining = totalRegularBill - totalRegularCash;

  // Aggregated totals for mix orders table footer
  const totalMixQtySum = useMemo(() => {
    let sum = 0;
    for (const lines of mixGroups.values()) {
      sum += lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
    }
    return sum;
  }, [mixGroups]);
  const totalMixBillSum = useMemo(() => {
    let sum = 0;
    for (const lines of mixGroups.values()) {
      sum += lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.rate_per_bag) || 0), 0);
    }
    return sum;
  }, [mixGroups]);
  const totalMixCashSum = useMemo(() => {
    let sum = 0;
    for (const lines of mixGroups.values()) {
      sum += lines.reduce((s, l) => s + (Number(l.cash_received) || 0), 0);
    }
    return sum;
  }, [mixGroups]);
  const totalMixRemainingSum = totalMixBillSum - totalMixCashSum;

  // True whole-day totals summarizing the entire active date/location dataset
  const daySalesTotals = useMemo(() => {
    let totalBilled = 0;
    let cashCollected = 0;
    for (const s of sales) {
      const bill = (Number(s.quantity) || 0) * (Number(s.rate_per_bag) || 0) + (Number(s.rickshaw_fare) || 0);
      totalBilled += bill;
      cashCollected += (Number(s.cash_received) || 0);
    }
    const creditOutstanding = Math.max(0, totalBilled - cashCollected);
    const totalTransactions = sales.length;
    return {
      totalTransactions,
      totalBilled,
      cashCollected,
      creditOutstanding,
    };
  }, [sales]);

  const totalCashIn = daySalesTotals.cashCollected;
  const totalExpensesAmt = expenses.reduce((sum, e) => sum + e.amount, 0);

  // ── Today's Expenses: client-side pagination + description search ──
  // (Expenses for a single date are bounded — client-side is the simplest
  //  approach with no API changes needed.)
  const [expenseSearchInput, setExpenseSearchInput] = useState("");
  const [expenseSearchDebounced, setExpenseSearchDebounced] = useState("");
  const [expensePage, setExpensePage] = useState(1);
  const [downloadingExpensesExcel, setDownloadingExpensesExcel] = useState(false);
  const [downloadingExpensesPdf, setDownloadingExpensesPdf] = useState(false);
  const EXPENSE_PAGE_SIZE = 10;

  // ── Today's Customer Payments: server-side pagination + customer-name search ──
  // State declarations moved up (see "Customer Payment panel state" block).

  // Debounce customer-payment search + reset page on new search
  useEffect(() => {
    const t = setTimeout(() => {
      setCpSearchDebounced(cpSearchInput);
      setCpPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [cpSearchInput]);

  // Reset page when date changes (customer payments array is reloaded)
  useEffect(() => {
    setCpPage(1);
    setCpSearchInput("");
    setCpSearchDebounced("");
  }, [date]);

  // Debounce expense search + reset page on new search
  useEffect(() => {
    const t = setTimeout(() => {
      setExpenseSearchDebounced(expenseSearchInput);
      setExpensePage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [expenseSearchInput]);

  // Reset page when date changes (expenses array is reloaded)
  useEffect(() => { setExpensePage(1); setExpenseSearchInput(""); setExpenseSearchDebounced(""); }, [date]);

  const filteredExpenses = useMemo(() => {
    if (!expenseSearchDebounced.trim()) return expenses;
    const q = expenseSearchDebounced.trim().toLowerCase();
    return expenses.filter((e) => (e.description || "").toLowerCase().includes(q));
  }, [expenses, expenseSearchDebounced]);

  const expenseTotal = filteredExpenses.length;
  const expenseTotalPages = Math.max(1, Math.ceil(expenseTotal / EXPENSE_PAGE_SIZE));
  const expensePageSafe = Math.min(expensePage, expenseTotalPages);
  const pagedExpenses = useMemo(() => {
    const from = (expensePageSafe - 1) * EXPENSE_PAGE_SIZE;
    return filteredExpenses.slice(from, from + EXPENSE_PAGE_SIZE);
  }, [filteredExpenses, expensePageSafe]);

  // Download ALL expenses for the date as Excel (not just visible / filtered)
  const handleDownloadExpensesExcel = async () => {
    setDownloadingExpensesExcel(true);
    try {
      const { downloadExcel } = await import("@/lib/download-excel");
      // intentionally use the full `expenses` array — user wants every record
      // for the date in the workbook, not the current search filter.
      await downloadExcel(
        expenses as unknown as Record<string, any>[],
        [
          { key: "description", label: "Description" },
          { key: "amount", label: "Amount (Rs.)", align: "right" },
        ],
        `expenses-${date}`,
      );
      toast.success("Expenses Excel downloaded");
    } catch (err: any) {
      toast.error(err?.message || "Excel download failed");
    } finally {
      setDownloadingExpensesExcel(false);
    }
  };

  // Download ALL expenses for the date as PDF Report
  const handleDownloadExpensesPdf = async () => {
    setDownloadingExpensesPdf(true);
    try {
      toast.loading("Generating Expenses PDF…", { id: "pdf-expenses-dl" });
      if (expenses.length === 0) {
        toast.error("No expenses to download for this date", { id: "pdf-expenses-dl" });
        return;
      }
      const { generateExpensesReportPDF } = await import("@/lib/generate-report-pdf");
      await generateExpensesReportPDF({
        expenses,
        date,
      });
      toast.success(`Expenses PDF downloaded (${expenses.length} records)`, { id: "pdf-expenses-dl" });
    } catch (e: any) {
      toast.error(e?.message || "Failed to download PDF", { id: "pdf-expenses-dl" });
    } finally {
      setDownloadingExpensesPdf(false);
    }
  };

  const [expandedMix, setExpandedMix] = useState<Set<string>>(new Set());
  const toggleMix = (id: string) => {
    setExpandedMix((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* PageHeader skeleton */}
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-80" />
          </div>
          {/* Filter card skeleton */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4 flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-9 w-[200px]" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-9 w-[200px]" />
            </div>
          </div>
          {/* Available stock panel skeleton */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4 space-y-3">
            <Skeleton className="h-5 w-40" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="p-3 rounded-lg border border-slate-100">
                  <Skeleton className="h-3 w-20 mb-2" />
                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
            </div>
          </div>
          {/* Add a Sale card skeleton */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm">
            <div className="p-6 space-y-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-96" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-10 w-40" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <ConfirmAction open={confirmOpen} onOpenChange={setConfirmOpen} title={confirmTitle} description={confirmDesc} confirmLabel="Haan, Delete Karo" variant="danger" onConfirm={confirmAction ?? (() => {})} loading={confirmLoading} />
        <PageHeader title="Daily Entry" subtitle="Add today's sales and expenses, and see the live cash summary." />

        <QuickNav
          title="Jump to"
          items={[
            { id: "section-filter", label: "Date / Location", icon: CalendarDays },
            { id: "section-add-sale", label: "Add a Sale", icon: Plus },
            { id: "section-cart", label: "Current Cart", icon: ShoppingCart },
            { id: "section-search-customer", label: "Search Customer", icon: Search },
            { id: "section-complete-sale", label: "Complete Sale", icon: CheckCircle2 },
            { id: "section-today-sales", label: "Today's Sales", icon: Receipt },
            { id: "section-add-expense", label: "Add Expense", icon: TrendingDown },
            { id: "section-today-expenses", label: "Today's Expenses", icon: TrendingDown, iconColor: "text-orange-500" },
            { id: "section-add-customer-payment", label: "Add Payment", icon: Wallet, iconColor: "text-[#087F83]" },
            { id: "section-customer-payment-history", label: "Payment History", icon: Wallet },
          ]}
        />

        <Card id="section-filter" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
          <CardContent className="p-4 flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-[200px]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Location</Label>
                <LocationSelect value={locationId} onChange={setLocationId} />
              </div>
            </div>
            <Button
              onClick={handleDownloadDaySummaryPdf}
              variant="outline"
              disabled={downloadingDaySummaryPdf}
              className="gap-2 border-emerald-600/30 text-emerald-800 bg-emerald-50/50 hover:bg-emerald-100/60"
            >
              {downloadingDaySummaryPdf ? (
                <Loader2 className="size-4 animate-spin text-emerald-700" />
              ) : (
                <FileText className="size-4 text-emerald-700" />
              )}
              {downloadingDaySummaryPdf ? "Generating Summary..." : "Supervisor Day Summary (PDF)"}
            </Button>
          </CardContent>
        </Card>

        {/* ── Available Stock panel (top) ──
            Shown at the very top so the user can see what stock is on hand
            BEFORE entering any sales. Auto-refreshes when stockRefreshTrigger
            is bumped (after sale complete / sale delete / mix order delete). */}
        <AvailableStock refreshTrigger={stockRefreshTrigger} />

        <Card id="section-add-sale" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="size-5 text-slate-600" />
              Add a Sale
            </CardTitle>
            <CardDescription>
              Add every product the customer is buying into the cart below, then
              click <strong>Complete Sale</strong> once — this saves it all as one bill.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase text-slate-500 font-semibold">Selling in</Label>
              <RadioGroup value={unitChoice} onValueChange={(v) => setUnitChoice(v as "bags" | "kg")} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="bags" id="unit-bags" />
                  <Label htmlFor="unit-bags" className="font-normal cursor-pointer">Bags</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="kg" id="unit-kg" />
                  <Label htmlFor="unit-kg" className="font-normal cursor-pointer">KG (loose)</Label>
                </div>
              </RadioGroup>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Product</Label>
                <Select value={productId} onValueChange={handleProductChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.filter((p) => p.is_active).map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedProduct && (() => {
                  // Calculate how many bags this sale will consume
                  const bw = bagWeightNum || (stockEntry?.last_bag_weight_kg ?? 50);
                  const saleBags = unitChoice === "kg"
                    ? (bw > 0 ? quantityNum / bw : quantityNum)
                    : quantityNum;
                  const remainingBags = stockBags - saleBags;
                  const stockKg = stockBags * bw;
                  const remainingKg = remainingBags * bw;
                  const isShort = remainingBags < 0;
                  return (
                    <div className={`rounded-md border px-3 py-2 text-xs space-y-1 ${isShort ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 flex items-center gap-1">
                          <Package className="size-3" /> Current Stock
                        </span>
                        <span className="font-semibold text-slate-700">{fmt(stockBags)} bags <span className="text-slate-400">({fmt(stockKg)} kg)</span></span>
                      </div>
                      {quantityNum > 0 && (
                        <div className="flex items-center justify-between">
                          <span className={isShort ? "text-red-600 font-medium" : "text-slate-500"}>After this sale</span>
                          <span className={`font-semibold ${isShort ? "text-red-600" : "text-emerald-700"}`}>
                            {fmt(remainingBags)} bags <span className="text-slate-400">({fmt(remainingKg)} kg)</span>
                            {isShort && <span className="ml-1 text-red-600 font-bold">⚠ Short</span>}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  {unitChoice === "bags" ? "Quantity (bags)" : "Quantity (kg)"}
                </Label>
                <Input type="number" min="0" step={unitChoice === "bags" ? "1" : "5"} placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                {unitChoice === "bags" && (
                  <div className="mt-2">
                    <Label className="text-xs text-slate-400 mb-1 block">Bag Weight (kg)</Label>
                    <Input type="number" min="0" step="5" value={bagWeight} onChange={(e) => setBagWeight(e.target.value)} />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  {unitChoice === "bags" ? "Rate per Bag (Rs.)" : "Rate per KG (Rs.)"}
                </Label>
                <Input type="number" min="0" step="10" placeholder="0" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5">
              <span className="text-sm text-amber-800">This line: {fmt(quantityNum)} x Rs. {fmt(rateNum)}</span>
              <span className="text-sm font-bold text-amber-900">Rs. {fmt(lineAmount)}</span>
            </div>

            <Button onClick={handleAddToCart} className="w-full" size="lg" disabled={!selectedProduct}>
              <Plus className="size-4" /> Add to Cart
            </Button>
          </CardContent>
        </Card>

        <Card id="section-cart" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="size-5 text-slate-600" />
              Current Cart
              {cartItems.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-slate-900 text-white text-xs font-bold size-5">{cartItems.length}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cartItems.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Cart is empty — add products above.</p>
            ) : (
              <>
                <div className="max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold">Product</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Qty</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Rate</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Amount</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Stock After</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cartItems.map((item, idx) => {
                        // Compute remaining stock for THIS product AT THE SELECTED LOCATION.
                        const entry = stockData.find(
                          (s) => Number(s.product_id) === Number(item.product_id) && Number(s.location_id) === Number(locationId)
                        );
                        const currentBags = entry?.stock_quantity ?? 0;
                        const bw = item.bag_weight_kg ?? (entry?.last_bag_weight_kg ?? 50);
                        const totalCartBags = cartItems
                          .filter((c) => c.product_id === item.product_id)
                          .reduce((sum, c) => {
                            const cbw = c.bag_weight_kg ?? bw;
                            return sum + (c.unit_type === "kg"
                              ? (cbw > 0 ? c.quantity / cbw : c.quantity)
                              : c.quantity);
                          }, 0);
                        const remaining = currentBags - totalCartBags;
                        const isShort = remaining < 0;
                        return (
                          <TableRow key={idx}>
                            <TableCell className="font-medium text-sm">{item.product}</TableCell>
                            <TableCell className="text-sm text-right">{fmt(item.quantity)}{item.unit_type === "kg" ? " kg" : ""}</TableCell>
                            <TableCell className="text-sm text-right">{fmt(item.rate)}</TableCell>
                            <TableCell className="text-sm text-right font-semibold">Rs. {fmt(item.amount)}</TableCell>
                            <TableCell className={`text-sm text-right font-semibold ${isShort ? "text-red-600" : "text-emerald-700"}`}>
                              {fmt(remaining)} bags
                              {isShort && <span className="ml-1 text-red-600">⚠</span>}
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="size-7 text-slate-400 hover:text-red-600" onClick={() => removeItem(idx)}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2 px-2">
                  <span className="text-xs uppercase text-slate-500 font-semibold">Cart Subtotal</span>
                  <span className="text-lg font-extrabold text-slate-900">Rs. {fmt(cartTotal)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {customerType === "credit" ? (
          <Card id="section-search-customer" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Search className="size-5 text-slate-600" /> Search Credit Customer (ادھار کھاتہ)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-slate-500 font-semibold">Type to search</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                    <Input placeholder="Start typing a customer name..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} className="pl-9" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-slate-500 font-semibold">Select customer</Label>
                  <Select value={selectedCustomerId} onValueChange={handleCustomerSelect}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Click to fill name" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredCustomers.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.type})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card id="section-search-customer" className="rounded-2xl border-dashed border-slate-200 bg-slate-50/60 shadow-none scroll-mt-24">
            <CardContent className="py-3.5 px-4 flex items-center justify-between gap-3 text-xs text-slate-500 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-semibold">
                  Cash Counter Mode
                </span>
                <span>Walk-in cash counter sale active — customer search & Khata accounts are bypassed.</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-blue-600 hover:text-blue-700 p-0 hover:bg-transparent underline"
                onClick={() => handleCustomerTypeChange("credit")}
              >
                Switch to Credit (ادھار کھاتہ)
              </Button>
            </CardContent>
          </Card>
        )}

        <Card id="section-complete-sale" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="size-5 text-green-600" /> Complete Sale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase text-slate-500 font-semibold">Customer Type</Label>
              <RadioGroup value={customerType} onValueChange={(v) => handleCustomerTypeChange(v as "credit" | "cash")} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="credit" id="ctype-credit" />
                  <Label htmlFor="ctype-credit" className="font-normal cursor-pointer">Credit (ادھار کھاتہ)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="cash" id="ctype-cash" />
                  <Label htmlFor="ctype-cash" className="font-normal cursor-pointer">Cash (نقد)</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">
                  Customer Name {customerType === "cash" ? (
                    <span className="text-slate-400 font-normal normal-case">(Optional for Walk-in Cash)</span>
                  ) : (
                    <span className="text-red-500 ml-0.5">*</span>
                  )}
                </Label>
                <Input
                  placeholder={customerType === "cash" ? "Walk-in Cash Customer (Optional)" : "Type name — existing customer is matched automatically"}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
                {customerType === "cash" && (
                  <p className="text-[11px] text-slate-500 leading-tight">
                    Walk-in cash counter sale. Customer name is strictly optional and will not create a Khata account or pollute debtors.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Rickshaw Freight (Rs.)</Label>
                <Input type="number" min="0" step="50" value={rickshawFare} onChange={(e) => setRickshawFare(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Rickshaw Driver Name</Label>
                <Input placeholder="Leave blank if not applicable" value={rickshawDriver} onChange={(e) => setRickshawDriver(e.target.value)} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase text-slate-500 font-semibold">Cash Received Now (Rs.)</Label>
                  {customerType === "cash" && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                      <Lock className="size-3" /> Auto-Locked (Full Payment)
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    value={customerType === "cash" ? grandTotal : cashReceived}
                    onChange={(e) => {
                      if (customerType !== "cash") {
                        setCashReceived(e.target.value);
                      }
                    }}
                    readOnly={customerType === "cash"}
                    disabled={customerType === "cash"}
                    className={customerType === "cash" ? "bg-slate-100/90 text-slate-800 font-bold border-slate-300 cursor-not-allowed pr-9" : ""}
                  />
                  {customerType === "cash" && (
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  )}
                </div>
                {customerType === "cash" && (
                  <p className="text-[11px] text-emerald-700 font-medium leading-tight">
                    In a cash counter transaction, the bill amount must be paid in full on the spot. Auto-locked to Rs. {fmt(grandTotal)}.
                  </p>
                )}
              </div>
            </div>

            {/* Opening Balance — ONLY visible when Credit (ادھار کھاتہ) is selected */}
            {customerType === "credit" && (
              <div className={`rounded-lg border px-4 py-3 space-y-2 transition-colors ${obModified ? "border-blue-300 bg-blue-50/60" : "border-amber-200 bg-amber-50/60"}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px] space-y-1.5">
                    <Label className="text-xs uppercase text-amber-700 font-semibold flex items-center gap-1.5 flex-wrap">
                      Opening Balance (Rs.) — purana balance
                      {obModified && savedOpeningBalance !== null && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 text-white px-2 py-0.5 text-[10px] font-bold tracking-normal normal-case">
                          Modified · will overwrite Rs. {fmt(savedOpeningBalance)}
                        </span>
                      )}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="0"
                      value={openingBalance}
                      onChange={(e) => setOpeningBalance(e.target.value)}
                      className="bg-white"
                    />
                    <p className="text-[11px] text-amber-800/80 leading-tight">
                      Agar customer ka koi purana balance hai jo aap ko pata hai (system se pehle ke sales),
                      wo yahan likh dein. Ye customer ki Khata me <strong>opening balance</strong> ke roop me
                      save ho jayega aur har bill me total ke saath add hoga. Existing customer select karne par
                      purani value auto-fill ho jati hai.{" "}
                      <strong className="text-blue-700">Agar value change ki to sale complete karte hi
                      database me overwrite ho jayega.</strong>
                    </p>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-[10px] uppercase tracking-wider text-amber-700/80 font-semibold">Total Receivable</span>
                    <span className="text-lg font-extrabold text-amber-900 tabular-nums">
                      Rs. {fmt((parseFloat(openingBalance) || 0) + grandTotal)}
                    </span>
                    <span className="text-[10px] text-amber-700/70">
                      (Opening + Grand Total)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Use Advance Payment block ──
                Visible ONLY when Credit is selected AND the selected customer has an existing
                advance_payment balance (> 0).
            */}
            {customerType === "credit" && selectedCustomerAdvance > 0 && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50/70 px-4 py-3 space-y-2">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex items-start gap-2 flex-1 min-w-[200px]">
                    <Checkbox
                      id="use-advance"
                      checked={useAdvance}
                      onCheckedChange={(v) => setUseAdvance(v === true)}
                      className="mt-0.5 border-emerald-500 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                    />
                    <div className="space-y-1">
                      <Label htmlFor="use-advance" className="text-sm font-semibold text-emerald-800 cursor-pointer flex items-center gap-1.5 flex-wrap">
                        <Wallet className="size-4" /> Use advance payment for this sale
                      </Label>
                      <p className="text-[11px] text-emerald-700/90 leading-tight">
                        Is customer ke paas <strong>Rs. {fmt(selectedCustomerAdvance)}</strong> advance
                        payment hai. Agar ye checkbox tick karen to sale ke total me se utna amount
                        (max Rs. {fmt(Math.min(selectedCustomerAdvance, grandTotal))}) auto minus ho
                        jayega aur customer ka advance_payment balance kam ho jayega.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Live math — show how the sale + advance interact */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 border-t border-emerald-200/70">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-emerald-700/80 font-semibold">Sale Total</div>
                    <div className="text-sm font-bold text-slate-900 tabular-nums">Rs. {fmt(grandTotal)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-emerald-700/80 font-semibold">
                      {useAdvance ? "Advance Applied" : "Advance Available"}
                    </div>
                    <div className="text-sm font-bold text-emerald-700 tabular-nums">
                      Rs. {fmt(useAdvance ? appliedAdvance : selectedCustomerAdvance)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-emerald-700/80 font-semibold">
                      {useAdvance ? "Customer Pays Cash" : "Customer Pays Cash"}
                    </div>
                    <div className={`text-sm font-bold tabular-nums ${useAdvance ? "text-emerald-800" : "text-slate-700"}`}>
                      Rs. {fmt(Math.max(0, grandTotal - appliedAdvance))}
                    </div>
                  </div>
                </div>

                {/* When checked AND there's leftover advance, show what will remain */}
                {useAdvance && (selectedCustomerAdvance - appliedAdvance) > 0 && (
                  <div className="text-[11px] text-emerald-700/80">
                    Sale ke baad customer ke advance balance me <strong>Rs. {fmt(selectedCustomerAdvance - appliedAdvance)}</strong> bacha jayega.
                  </div>
                )}
                {useAdvance && (selectedCustomerAdvance - appliedAdvance) === 0 && (
                  <div className="text-[11px] text-emerald-700/80">
                    Sale ke baad customer ka advance balance <strong>0</strong> ho jayega (poora consume ho gaya).
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg bg-slate-900 text-white px-4 py-3">
              <span className="text-sm font-medium">Grand Total (incl. freight)</span>
              <span className="text-xl font-extrabold">Rs. {fmt(grandTotal)}</span>
            </div>

            <Button onClick={handleCompleteSale} className="w-full" size="lg" disabled={cartItems.length === 0 || savingSale}>
              {savingSale ? <Loader2 className="size-4 animate-spin mr-2" /> : <CheckCircle2 className="size-4 mr-2" />}
              {savingSale ? "Saving..." : "Complete Sale"}
            </Button>
          </CardContent>
        </Card>

        <Card id="section-today-sales" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="size-5 text-slate-600" /> Today&apos;s Sales
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Location filter — All / Shop / Farmhouse */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs uppercase text-slate-500 font-semibold whitespace-nowrap">Location:</span>
                  <LocationSelect
                    value={salesLocationFilter}
                    onChange={(v) => { setSalesLocationFilter(v); setSalesPage(1); }}
                    showAllOption
                    className="h-9 w-[140px]"
                  />
                </div>
                {/* Rows per page selector: All / 25 / 50 / 100 */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs uppercase text-slate-500 font-semibold whitespace-nowrap">Show:</span>
                  <Select
                    value={salesPageSize}
                    onValueChange={(v) => {
                      setSalesPageSize(v as "all" | "25" | "50" | "100");
                      setSalesPage(1);
                    }}
                  >
                    <SelectTrigger className="h-9 w-[115px] text-xs">
                      <SelectValue placeholder="All rows" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All ({sales.length})</SelectItem>
                      <SelectItem value="25">25 rows</SelectItem>
                      <SelectItem value="50">50 rows</SelectItem>
                      <SelectItem value="100">100 rows</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input
                    value={salesSearchInput}
                    onChange={(e) => {
                      setSalesSearchInput(e.target.value);
                      setSalesPage(1);
                    }}
                    placeholder="Search by customer name..."
                    className="pl-8 w-full sm:w-60 h-9"
                  />
                  {salesSearchInput && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-slate-400"
                      onClick={() => {
                        setSalesSearchInput("");
                        setSalesPage(1);
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadSalesPdf}
                  disabled={downloadingSalesPdf || salesTotal === 0}
                  className="shrink-0 gap-1.5"
                >
                  {downloadingSalesPdf ? (
                    <Loader2 className="size-4 animate-spin text-slate-500" />
                  ) : (
                    <FileText className="size-4 text-emerald-700" />
                  )}
                  {downloadingSalesPdf ? "Generating PDF..." : "Download PDF"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadSalesExcel}
                  disabled={downloadingSalesExcel || salesTotal === 0}
                  className="shrink-0"
                >
                  {downloadingSalesExcel ? (
                    <Loader2 className="size-4 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="size-4 mr-1.5" />
                  )}
                  {downloadingSalesExcel ? "Downloading..." : "Download Excel (All)"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {sales.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                {salesLocationFilter > 0
                  ? `No sales at ${locationsList.find((l) => l.id === salesLocationFilter)?.name ?? "this location"} for this date.`
                  : "No sales entered yet for this date."}
              </p>
            ) : filteredSales.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                No sales record matching &ldquo;{salesSearchInput}&rdquo;.
              </p>
            ) : (
              <div className="space-y-6">
                {regularSales.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-slate-700">
                        Regular Sales ({regularSales.length})
                      </h3>
                      {salesSearchInput.trim() && (
                        <span className="text-xs text-slate-500">
                          Matching &ldquo;{salesSearchInput.trim()}&rdquo;
                        </span>
                      )}
                    </div>
                    <div className="max-h-[600px] overflow-y-auto rounded-lg border border-slate-200/60 shadow-inner relative">
                      <Table>
                        <TableHeader className="sticky top-0 bg-slate-100 z-10 shadow-sm">
                          <TableRow className="bg-slate-100 hover:bg-slate-100 border-b border-slate-200">
                            <TableHead className="text-xs uppercase text-slate-600 font-semibold bg-slate-100">Customer</TableHead>
                            <TableHead className="text-xs uppercase text-slate-600 font-semibold bg-slate-100">Type</TableHead>
                            <TableHead className="text-xs uppercase text-slate-600 font-semibold bg-slate-100">Location</TableHead>
                            <TableHead className="text-xs uppercase text-slate-600 font-semibold hidden lg:table-cell bg-slate-100">Product</TableHead>
                            <TableHead className="text-xs uppercase text-slate-600 font-semibold text-right bg-slate-100">Qty</TableHead>
                            <TableHead className="text-xs uppercase text-slate-600 font-semibold text-right hidden sm:table-cell bg-slate-100">Rate</TableHead>
                            <TableHead className="text-xs uppercase text-slate-600 font-semibold text-right hidden md:table-cell bg-slate-100">Rickshaw</TableHead>
                            <TableHead className="text-xs uppercase text-slate-600 font-semibold text-right bg-slate-100">Bill</TableHead>
                            <TableHead className="text-xs uppercase text-slate-600 font-semibold text-right hidden sm:table-cell bg-slate-100">Cash</TableHead>
                            <TableHead className="text-xs uppercase text-slate-600 font-semibold text-right hidden lg:table-cell bg-slate-100">Remaining</TableHead>
                            <TableHead className="w-20 bg-slate-100">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagedRegularSales.map((s) => {
                            const bill = s.quantity * s.rate_per_bag + s.rickshaw_fare;
                            const remaining = bill - s.cash_received;
                            const unitSuffix = s.unit_type === "kg" ? " kg" : "";
                            const locName = locationsList.find((l) => l.id === s.location_id)?.name
                              ?? (s.location_id ? `Loc #${s.location_id}` : "—");
                            const isFarmhouse = s.location_id === 1;
                            return (
                              <TableRow key={s.id} className="hover:bg-slate-50/70">
                                <TableCell className="text-sm font-medium">{s.customers?.name ?? "—"}</TableCell>
                                <TableCell>
                                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", s.customers?.type === "credit" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800")}>
                                    {s.customers?.type ?? "—"}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", isFarmhouse ? "bg-indigo-100 text-indigo-800" : "bg-blue-100 text-blue-800")} title={`This sale was recorded at ${locName}`}>
                                    {locName}
                                  </span>
                                </TableCell>
                                <TableCell className="text-sm hidden lg:table-cell">{s.products?.name ?? "—"}</TableCell>
                                <TableCell className="text-sm text-right tabular-nums">{fmt(s.quantity)}{unitSuffix}</TableCell>
                                <TableCell className="text-sm text-right tabular-nums hidden sm:table-cell">{fmt(s.rate_per_bag)}</TableCell>
                                <TableCell className="text-sm text-right tabular-nums hidden md:table-cell">{s.rickshaw_fare > 0 ? fmt(s.rickshaw_fare) : "—"}{s.rickshaw_driver_name && <span className="block text-xs text-slate-400"><Truck className="inline size-3" /> {s.rickshaw_driver_name}</span>}</TableCell>
                                <TableCell className="text-sm text-right tabular-nums font-semibold">{fmt(bill)}</TableCell>
                                <TableCell className="text-sm text-right tabular-nums hidden sm:table-cell">{s.cash_received > 0 ? fmt(s.cash_received) : "—"}</TableCell>
                                <TableCell className={cn("text-sm text-right tabular-nums font-semibold hidden lg:table-cell", remaining > 0 ? "text-red-600" : "text-green-600")}>{fmt(remaining)}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-0.5">
                                    <Button variant="ghost" size="icon" className="size-7 text-slate-400 hover:text-blue-600" onClick={() => handleEditSale(s)} title="Edit sale">
                                      <Pencil className="size-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="size-7 text-slate-400 hover:text-red-600" onClick={() => handleDeleteSale(s.id)} title="Delete sale">
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                        <TableFooter className="sticky bottom-0 bg-slate-100/95 backdrop-blur font-bold border-t-2 border-slate-300 z-10">
                          <TableRow className="hover:bg-slate-100">
                            <TableCell colSpan={3} className="text-xs uppercase tracking-wider text-slate-700 bg-slate-100 font-bold">
                              Total ({regularSales.length} {regularSales.length === 1 ? "Sale" : "Sales"})
                            </TableCell>
                            <TableCell className="hidden lg:table-cell bg-slate-100" />
                            <TableCell className="text-sm text-right tabular-nums text-slate-900 font-bold bg-slate-100">
                              {fmt(totalRegularQty)}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-right text-slate-400 font-normal bg-slate-100">—</TableCell>
                            <TableCell className="hidden md:table-cell text-right tabular-nums text-slate-700 bg-slate-100">
                              {totalRegularRickshaw > 0 ? fmt(totalRegularRickshaw) : "—"}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums text-slate-900 font-extrabold bg-slate-100">
                              Rs. {fmt(totalRegularBill)}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-sm text-right tabular-nums text-emerald-700 font-bold bg-slate-100">
                              Rs. {fmt(totalRegularCash)}
                            </TableCell>
                            <TableCell className={cn("hidden lg:table-cell text-sm text-right tabular-nums font-extrabold bg-slate-100", totalRegularRemaining > 0 ? "text-red-600" : "text-emerald-600")}>
                              Rs. {fmt(totalRegularRemaining)}
                            </TableCell>
                            <TableCell className="bg-slate-100" />
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>
                  </div>
                )}

                {mixGroups.size > 0 && (
                  <div>
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                        <Beaker className="size-4 text-purple-500" /> Mix Orders ({mixGroups.size})
                      </h3>
                      {salesSearchInput.trim() && (
                        <span className="text-xs text-slate-500">
                          Matching &ldquo;{salesSearchInput.trim()}&rdquo;
                        </span>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200/60 shadow-inner relative">
                      <Table>
                        <TableHeader className="sticky top-0 bg-slate-100 z-10 shadow-sm">
                          <TableRow className="bg-slate-100 hover:bg-slate-100 border-b border-slate-200">
                            <TableHead className="text-xs uppercase text-slate-600 font-semibold bg-slate-100">Customer</TableHead>
                            <TableHead className="text-xs uppercase text-slate-600 font-semibold bg-slate-100">Order</TableHead>
                            <TableHead className="text-xs uppercase text-slate-600 font-semibold bg-slate-100">Location</TableHead>
                            <TableHead className="text-xs uppercase text-slate-600 font-semibold text-right bg-slate-100">Total Qty</TableHead>
                            <TableHead className="text-xs uppercase text-slate-600 font-semibold text-right hidden md:table-cell bg-slate-100">Total Bill</TableHead>
                            <TableHead className="text-xs uppercase text-slate-600 font-semibold text-right hidden md:table-cell bg-slate-100">Cash</TableHead>
                            <TableHead className="text-xs uppercase text-slate-600 font-semibold text-right bg-slate-100">Remaining</TableHead>
                            <TableHead className="w-10 bg-slate-100" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Array.from(mixGroups.entries()).map(([mixOrderId, lines]) => {
                            const custName = lines[0].customers?.name ?? "—";
                            const totalQty = lines.reduce((sum, l) => sum + l.quantity, 0);
                            const totalMixBill = lines.reduce((sum, l) => sum + l.quantity * l.rate_per_bag, 0);
                            const totalMixCash = lines.reduce((sum, l) => sum + l.cash_received, 0);
                            const mixRemaining = totalMixBill - totalMixCash;
                            const isExpanded = expandedMix.has(mixOrderId);
                            const groupId = mixOrderId;
                            const mixLocId = lines[0]?.location_id;
                            const mixLocName = locationsList.find((l) => l.id === mixLocId)?.name
                              ?? (mixLocId ? `Loc #${mixLocId}` : "—");
                            const isMixFarmhouse = mixLocId === 1;

                            return (
                              <TableRow key={mixOrderId} className="hover:bg-slate-50/70">
                                <TableCell className="font-medium text-sm">
                                  <Collapsible open={isExpanded} onOpenChange={() => toggleMix(mixOrderId)}>
                                    <CollapsibleTrigger className="flex items-center gap-1 text-left hover:underline">
                                      {custName}
                                      <ChevronDown className={cn("size-3.5 text-slate-400 transition-transform", isExpanded && "rotate-180")} />
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <div className="mt-2 ml-2 rounded-lg border border-purple-100 bg-purple-50/50 p-2">
                                        <Table>
                                          <TableHeader>
                                            <TableRow className="bg-transparent hover:bg-transparent border-0">
                                              <TableHead className="text-xs text-slate-500 py-1">Ingredient</TableHead>
                                              <TableHead className="text-xs text-slate-500 py-1 text-right">Qty (kg)</TableHead>
                                              <TableHead className="text-xs text-slate-500 py-1 text-right">Rate/kg</TableHead>
                                              <TableHead className="text-xs text-slate-500 py-1 text-right">Amount</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {lines.map((l) => (
                                              <TableRow key={l.id} className="bg-transparent hover:bg-purple-100/50 border-0">
                                                <TableCell className="py-1 text-sm">{l.products?.name}</TableCell>
                                                <TableCell className="py-1 text-sm text-right tabular-nums">{fmt(l.quantity)}</TableCell>
                                                <TableCell className="py-1 text-sm text-right tabular-nums">{fmt(l.rate_per_bag)}</TableCell>
                                                <TableCell className="py-1 text-sm text-right tabular-nums font-medium">{fmt(l.quantity * l.rate_per_bag)}</TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </CollapsibleContent>
                                  </Collapsible>
                                </TableCell>
                                <TableCell>
                                  <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-800 px-2 py-0.5 text-xs font-semibold">
                                    <Beaker className="size-3" /> Mix Order
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", isMixFarmhouse ? "bg-indigo-100 text-indigo-800" : "bg-blue-100 text-blue-800")} title={`This mix order was recorded at ${mixLocName}`}>
                                    {mixLocName}
                                  </span>
                                </TableCell>
                                <TableCell className="text-sm text-right tabular-nums">{fmt(totalQty)} kg</TableCell>
                                <TableCell className="text-sm text-right tabular-nums font-semibold hidden md:table-cell">{fmt(totalMixBill)}</TableCell>
                                <TableCell className="text-sm text-right tabular-nums hidden md:table-cell">{totalMixCash > 0 ? fmt(totalMixCash) : "—"}</TableCell>
                                <TableCell className={cn("text-sm text-right tabular-nums font-semibold", mixRemaining > 0 ? "text-red-600" : "text-green-600")}>{fmt(mixRemaining)}</TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="icon" className="size-7 text-slate-400 hover:text-red-600" onClick={() => handleDeleteMixOrder(groupId)}>
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                        <TableFooter className="sticky bottom-0 bg-slate-100/95 backdrop-blur font-bold border-t-2 border-slate-300 z-10">
                          <TableRow className="hover:bg-slate-100">
                            <TableCell colSpan={3} className="text-xs uppercase tracking-wider text-slate-700 bg-slate-100 font-bold">
                              Total ({mixGroups.size} {mixGroups.size === 1 ? "Mix Order" : "Mix Orders"})
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums text-slate-900 font-bold bg-slate-100">
                              {fmt(totalMixQtySum)} kg
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-right tabular-nums text-slate-900 font-extrabold bg-slate-100">
                              Rs. {fmt(totalMixBillSum)}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-right tabular-nums text-emerald-700 font-bold bg-slate-100">
                              Rs. {fmt(totalMixCashSum)}
                            </TableCell>
                            <TableCell className={cn("text-sm text-right tabular-nums font-extrabold bg-slate-100", totalMixRemainingSum > 0 ? "text-red-600" : "text-emerald-600")}>
                              Rs. {fmt(totalMixRemainingSum)}
                            </TableCell>
                            <TableCell className="bg-slate-100" />
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Whole-Day Summary Cards */}
                {sales.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                    <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Transactions</span>
                        <Receipt className="size-4 text-slate-400" />
                      </div>
                      <div className="mt-1 text-2xl font-extrabold text-slate-900 tabular-nums">
                        {fmt(daySalesTotals.totalTransactions)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 font-medium">
                        All sales recorded for {date}
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Billed</span>
                        <DollarSign className="size-4 text-blue-500" />
                      </div>
                      <div className="mt-1 text-2xl font-extrabold text-slate-900 tabular-nums">
                        Rs. {fmt(daySalesTotals.totalBilled)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 font-medium">
                        Full day gross sales (incl. freight)
                      </div>
                    </div>

                    <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/80 p-3.5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Cash Collected</span>
                        <Banknote className="size-4 text-emerald-600" />
                      </div>
                      <div className="mt-1 text-2xl font-extrabold text-emerald-700 tabular-nums">
                        Rs. {fmt(daySalesTotals.cashCollected)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-emerald-700/80 font-medium">
                        Spot cash collected today
                      </div>
                    </div>

                    <div className={cn("rounded-xl p-3.5 shadow-sm border", daySalesTotals.creditOutstanding > 0 ? "bg-amber-50/70 border-amber-200/80" : "bg-slate-50 border-slate-200/70")}>
                      <div className="flex items-center justify-between">
                        <span className={cn("text-xs font-semibold uppercase tracking-wider", daySalesTotals.creditOutstanding > 0 ? "text-amber-800" : "text-slate-500")}>
                          Credit Outstanding Today
                        </span>
                        <Clock className={cn("size-4", daySalesTotals.creditOutstanding > 0 ? "text-amber-600" : "text-slate-400")} />
                      </div>
                      <div className={cn("mt-1 text-2xl font-extrabold tabular-nums", daySalesTotals.creditOutstanding > 0 ? "text-amber-900" : "text-slate-700")}>
                        Rs. {fmt(daySalesTotals.creditOutstanding)}
                      </div>
                      <div className={cn("mt-0.5 text-[11px] font-medium", daySalesTotals.creditOutstanding > 0 ? "text-amber-700/80" : "text-slate-500")}>
                        {daySalesTotals.creditOutstanding > 0 ? "Total credit billed today" : "All sales cleared in cash"}
                      </div>
                    </div>
                  </div>
                )}

                {/* Row counter & pagination controls if a page size is selected */}
                {filteredSales.length > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-xs text-slate-500 border-t border-slate-100">
                    <div>
                      {salesPageSize === "all" ? (
                        <span>
                          Showing <strong>all {filteredSales.length}</strong> records
                          {salesSearchInput.trim() ? ` matching "${salesSearchInput.trim()}"` : ""}
                          {" · "}Scroll the table to inspect all records
                        </span>
                      ) : (
                        <span>
                          Page <strong>{salesPage}</strong> of <strong>{regularSalesTotalPages}</strong>
                          {" · "}Showing {(salesPage - 1) * Number(salesPageSize) + 1}–{Math.min(salesPage * Number(salesPageSize), regularSales.length)} of {regularSales.length} regular sales
                          {salesSearchInput.trim() ? ` matching "${salesSearchInput.trim()}"` : ""}
                        </span>
                      )}
                    </div>

                    {salesPageSize !== "all" && regularSalesTotalPages > 1 && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={salesPage <= 1}
                          onClick={() => setSalesPage((p) => Math.max(1, p - 1))}
                          className="h-8 px-3"
                        >
                          <ChevronLeft className="size-4 mr-1" />
                          Prev
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={salesPage >= regularSalesTotalPages}
                          onClick={() => setSalesPage((p) => p + 1)}
                          className="h-8 px-3"
                        >
                          Next
                          <ChevronRight className="size-4 ml-1" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card id="section-add-expense" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="size-5 text-red-500" /> Add an Expense
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-[3fr_1fr] gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Description</Label>
                <Input placeholder="e.g. Rickshaw, Tea, Labour" value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Amount (Rs.)</Label>
                <Input type="number" min="0" step="50" placeholder="0" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleAddExpense} className="w-full mt-3" variant="outline" disabled={savingExpense}>
              {savingExpense ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
              {savingExpense ? "Adding..." : "Add Expense"}
            </Button>
          </CardContent>
        </Card>

        <Card id="section-today-expenses" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingDown className="size-5 text-slate-600" /> Today&apos;s Expenses
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input
                    value={expenseSearchInput}
                    onChange={(e) => setExpenseSearchInput(e.target.value)}
                    placeholder="Search by description..."
                    className="pl-8 w-full sm:w-56 h-9"
                  />
                  {expenseSearchInput && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-slate-400"
                      onClick={() => setExpenseSearchInput("")}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadExpensesPdf}
                  disabled={downloadingExpensesPdf || expenses.length === 0}
                  className="shrink-0 gap-1.5"
                >
                  {downloadingExpensesPdf ? (
                    <Loader2 className="size-4 animate-spin text-slate-500" />
                  ) : (
                    <FileText className="size-4 text-emerald-700" />
                  )}
                  {downloadingExpensesPdf ? "Generating PDF..." : "Download PDF"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadExpensesExcel}
                  disabled={downloadingExpensesExcel || expenses.length === 0}
                  className="shrink-0"
                >
                  {downloadingExpensesExcel ? (
                    <Loader2 className="size-4 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="size-4 mr-1.5" />
                  )}
                  {downloadingExpensesExcel ? "Downloading..." : "Download Excel (All)"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {expenses.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No expenses recorded for this date.</p>
            ) : filteredExpenses.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">
                No record found for &quot;{expenseSearchDebounced.trim()}&quot;.
              </p>
            ) : (
              <>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200/60">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold">Description</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Amount (Rs.)</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedExpenses.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-sm">{e.description}</TableCell>
                          <TableCell className="text-sm text-right font-semibold">Rs. {fmt(e.amount)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="size-7 text-slate-400 hover:text-red-600" onClick={() => handleDeleteExpense(e.id)}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination controls */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <span className="text-xs text-slate-500">
                    Page {expensePageSafe} of {expenseTotalPages}
                    {" · "}
                    {expenseTotal} record{expenseTotal === 1 ? "" : "s"}
                    {expenseSearchDebounced.trim() ? ` matching "${expenseSearchDebounced.trim()}"` : ""}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={expensePageSafe <= 1}
                      onClick={() => setExpensePage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="size-4" />
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={expensePageSafe >= expenseTotalPages}
                      onClick={() => setExpensePage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between rounded-lg bg-red-50 border border-red-200 px-4 py-2.5">
                  <span className="text-sm font-semibold text-red-700">Total Expenses Today</span>
                  <span className="text-lg font-extrabold text-red-700">Rs. {fmt(totalExpensesAmt)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ──────────────────────────────────────────────────────────
            CUSTOMER PAYMENT PANEL
            A "customer payment" is money a customer hands over WITHOUT
            buying anything. Common at the farmhouse — a customer comes,
            gives cash, and leaves.

            Server-side logic (record_customer_payment RPC):
              1. If customer has debt (balance_due > 0), payment first
                 reduces the debt (lowers customer.opening_balance).
              2. Any excess → customer.advance_payment.
                 If customer has NO debt, the FULL amount becomes advance.
              3. A history row is inserted into customer_payments.

            The advance_payment can later be consumed during a sale
            (Complete Sale panel → "Use advance payment" checkbox).
           ────────────────────────────────────────────────────────── */}
        <Card id="section-add-customer-payment" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="size-5 text-emerald-600" /> Add a Customer Payment
            </CardTitle>
            <CardDescription>
              Jab customer paise de kar jata hai aur kuch buy nahi karta — yahan
              entry karein. Agar customer ka udhaar hai to pehle us se minus hoga,
              bacha hua amount <strong>advance payment</strong> ban jayega jo
              baad me kisi sale me use ho sakta hai.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Customer search + select — same pattern as the sale form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Search Customer</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input
                    placeholder="Type a customer name..."
                    value={cpCustomerSearch}
                    onChange={(e) => setCpCustomerSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Select Customer</Label>
                <Select
                  value={cpCustomerId}
                  onValueChange={(id) => {
                    setCpCustomerId(id);
                    const c = customers.find((x) => String(x.id) === id);
                    if (c) setCpCustomerSearch("");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Click to select" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers
                      .filter((c) => c.is_active)
                      .filter((c) => {
                        if (!cpCustomerSearch.trim()) return true;
                        return c.name.toLowerCase().includes(cpCustomerSearch.toLowerCase());
                      })
                      .map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name} ({c.type})
                          {Number(c.advance_payment ?? 0) > 0 && (
                            <span className="text-emerald-600"> · Adv Rs. {fmt(Number(c.advance_payment))}</span>
                          )}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Show selected customer's current debt + advance so the user
                knows what to expect before recording the payment */}
            {cpCustomerId && (() => {
              const c = customers.find((x) => String(x.id) === cpCustomerId);
              if (!c) return null;
              const adv = Number(c.advance_payment ?? 0);
              const ob = Number(c.opening_balance ?? 0);
              return (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Customer</div>
                    <div className="font-semibold text-slate-900">{c.name}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Opening Balance</div>
                    <div className={`font-semibold tabular-nums ${ob > 0 ? "text-amber-700" : "text-slate-500"}`}>
                      Rs. {fmt(ob)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Advance Payment</div>
                    <div className={`font-semibold tabular-nums ${adv > 0 ? "text-emerald-700" : "text-slate-500"}`}>
                      Rs. {fmt(adv)}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Amount (Rs.)</Label>
                <Input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="0"
                  value={cpAmount}
                  onChange={(e) => setCpAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-slate-500 font-semibold">Notes (optional)</Label>
                <Input
                  placeholder="e.g. cash received at farmhouse"
                  value={cpNotes}
                  onChange={(e) => setCpNotes(e.target.value)}
                />
              </div>
            </div>

            <Button
              onClick={handleSaveCustomerPayment}
              className="w-full"
              size="lg"
              disabled={savingCustomerPayment || !cpCustomerId}
            >
              {savingCustomerPayment ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <Wallet className="size-4 mr-2" />
              )}
              {savingCustomerPayment ? "Saving..." : "Save Customer Payment"}
            </Button>
          </CardContent>
        </Card>

        {/* ──────────────────────────────────────────────────────────
            CUSTOMER PAYMENTS HISTORY (today)
            Server-side paginated, customer-name search, Excel download.
            Mirrors the Today's Sales / Today's Expenses pattern.
           ────────────────────────────────────────────────────────── */}
        <Card id="section-customer-payment-history" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="size-5 text-slate-600" /> Today&apos;s Customer Payments
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <Input
                    value={cpSearchInput}
                    onChange={(e) => setCpSearchInput(e.target.value)}
                    placeholder="Search by customer name..."
                    className="pl-8 w-full sm:w-64 h-9"
                  />
                  {cpSearchInput && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-slate-400"
                      onClick={() => setCpSearchInput("")}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadCpPdf}
                  disabled={downloadingCpPdf || cpTotal === 0}
                  className="shrink-0 gap-1.5"
                >
                  {downloadingCpPdf ? (
                    <Loader2 className="size-4 animate-spin text-slate-500" />
                  ) : (
                    <FileText className="size-4 text-emerald-700" />
                  )}
                  {downloadingCpPdf ? "Generating PDF..." : "Download PDF"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadCpExcel}
                  disabled={downloadingCpExcel || cpTotal === 0}
                  className="shrink-0"
                >
                  {downloadingCpExcel ? (
                    <Loader2 className="size-4 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="size-4 mr-1.5" />
                  )}
                  {downloadingCpExcel ? "Downloading..." : "Download Excel (All)"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {customerPayments.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">
                {cpSearchDebounced.trim()
                  ? `No record for the customer "${cpSearchDebounced}".`
                  : "No customer payments recorded for this date."}
              </p>
            ) : (
              <>
                <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200/60">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold">Customer</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold">Type</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right">Amount Paid</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden sm:table-cell">Applied to Debt</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden sm:table-cell">Added to Advance</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden lg:table-cell">OB After</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold text-right hidden lg:table-cell">Adv After</TableHead>
                        <TableHead className="text-xs uppercase text-slate-500 font-semibold hidden md:table-cell">Notes</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerPayments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm font-medium">
                            {p.customers?.name ?? `#${p.customer_id}`}
                          </TableCell>
                          <TableCell>
                            <span className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                              p.customers?.type === "credit" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800",
                            )}>
                              {p.customers?.type ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-right font-bold tabular-nums text-emerald-700">
                            Rs. {fmt(Number(p.amount))}
                          </TableCell>
                          <TableCell className="text-sm text-right hidden sm:table-cell tabular-nums">
                            {Number(p.applied_to_opening) > 0 ? (
                              <span className="text-amber-700">Rs. {fmt(Number(p.applied_to_opening))}</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-right hidden sm:table-cell tabular-nums">
                            {Number(p.applied_to_advance) > 0 ? (
                              <span className="text-emerald-700">Rs. {fmt(Number(p.applied_to_advance))}</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-right hidden lg:table-cell tabular-nums text-slate-600">
                            Rs. {fmt(Number(p.opening_balance_after ?? 0))}
                          </TableCell>
                          <TableCell className="text-sm text-right hidden lg:table-cell tabular-nums text-slate-600">
                            Rs. {fmt(Number(p.advance_after ?? 0))}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500 hidden md:table-cell max-w-[200px] truncate">
                            {p.notes ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-slate-400 hover:text-red-600"
                              onClick={() => handleDeleteCustomerPayment(p.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination controls — same shape as Today's Sales */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <span className="text-xs text-slate-500">
                    Page {cpPage} of {cpTotalPages}
                    {" · "}
                    {cpTotal} record{cpTotal === 1 ? "" : "s"}
                    {cpSearchDebounced.trim() ? ` matching "${cpSearchDebounced}"` : ""}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cpPage <= 1}
                      onClick={() => setCpPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="size-4" />
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cpPage >= cpTotalPages}
                      onClick={() => setCpPage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>

                {/* Summary line — total amount + total advance added today */}
                <div className="mt-3 flex flex-wrap gap-3">
                  <div className="flex-1 min-w-[140px] rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5">
                    <div className="text-xs uppercase text-emerald-700 font-semibold tracking-wider">Total Received Today</div>
                    <div className="text-lg font-extrabold text-emerald-700 tabular-nums">
                      Rs. {fmt(customerPayments.reduce((sum, p) => sum + Number(p.amount), 0))}
                    </div>
                  </div>
                  <div className="flex-1 min-w-[140px] rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5">
                    <div className="text-xs uppercase text-blue-700 font-semibold tracking-wider">Added to Advance</div>
                    <div className="text-lg font-extrabold text-blue-700 tabular-nums">
                      Rs. {fmt(customerPayments.reduce((sum, p) => sum + Number(p.applied_to_advance), 0))}
                    </div>
                  </div>
                  <div className="flex-1 min-w-[140px] rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5">
                    <div className="text-xs uppercase text-amber-700 font-semibold tracking-wider">Applied to Debt</div>
                    <div className="text-lg font-extrabold text-amber-700 tabular-nums">
                      Rs. {fmt(customerPayments.reduce((sum, p) => sum + Number(p.applied_to_opening), 0))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200/60 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Cash Summary</div>
                <div className="text-sm text-slate-600 mt-1">
                  Cash In: Rs. {fmt(totalCashIn)} | Expenses: Rs. {fmt(totalExpensesAmt)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Expected Cash</div>
                <div className={cn("text-2xl font-extrabold", (totalCashIn - totalExpensesAmt) >= 0 ? "text-green-600" : "text-red-600")}>
                  Rs. {fmt(totalCashIn - totalExpensesAmt)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Edit Sale Dialog ── */}
      <EditSaleDialog
        open={editSaleOpen}
        onOpenChange={(v) => {
          setEditSaleOpen(v);
          if (!v) setEditSaleTarget(null);
        }}
        sale={editSaleTarget}
        products={products}
        customers={customers}
        locations={locationsList}
        saving={savingEditSale}
        onSave={handleSaveEditSale}
      />
    </div>
  );
}

/* ─── Edit Sale Dialog ───
   Inline editable form for a single regular sale (NOT mix orders).
   Lets the user change: customer, product, location, quantity, rate,
   rickshaw fare + driver, cash received, sale date, unit type + bag weight.
   On Save → calls PUT /api/sales with the full patch.
*/
interface EditSaleDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sale: Sale | null;
  products: Product[];
  customers: Customer[];
  locations: { id: number; name: string }[];
  saving: boolean;
  onSave: (patch: {
    id: number;
    customer_id: number;
    product_id: number;
    location_id: number | null;
    quantity: number;
    rate_per_bag: number;
    rickshaw_fare: number;
    rickshaw_driver_name: string | null;
    cash_received: number;
    sale_date: string;
    unit_type: "bags" | "kg";
    bag_weight_kg: number | null;
  }) => void;
}

function EditSaleDialog({ open, onOpenChange, sale, products, customers, locations, saving, onSave }: EditSaleDialogProps) {
  const [customerId, setCustomerId] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [ratePerBag, setRatePerBag] = useState<string>("");
  const [rickshawFare, setRickshawFare] = useState<string>("0");
  const [rickshawDriver, setRickshawDriver] = useState<string>("");
  const [cashReceived, setCashReceived] = useState<string>("0");
  const [saleDate, setSaleDate] = useState<string>("");
  const [unitType, setUnitType] = useState<"bags" | "kg">("bags");
  const [bagWeightKg, setBagWeightKg] = useState<string>("50");
  const [customerSearch, setCustomerSearch] = useState("");

  // Re-seed whenever the target sale changes
  useEffect(() => {
    if (!open || !sale) return;
    setCustomerId(sale.customer_id ? String(sale.customer_id) : "");
    setProductId(sale.product_id ? String(sale.product_id) : "");
    setLocationId(sale.location_id != null ? String(sale.location_id) : "");
    setQuantity(String(sale.quantity ?? ""));
    setRatePerBag(String(sale.rate_per_bag ?? ""));
    setRickshawFare(String(sale.rickshaw_fare ?? 0));
    setRickshawDriver(sale.rickshaw_driver_name ?? "");
    setCashReceived(String(sale.cash_received ?? 0));
    setSaleDate(sale.sale_date || pktToday());
    setUnitType((sale.unit_type as "bags" | "kg") || "bags");
    setBagWeightKg(sale.bag_weight_kg != null ? String(sale.bag_weight_kg) : "50");
    // Pre-fill customer search with the current customer's name
    setCustomerSearch(sale.customers?.name ?? "");
  }, [open, sale]);

  // Customer dropdown filter
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.filter((c) => c.is_active);
    const q = customerSearch.toLowerCase();
    return customers.filter((c) => c.is_active && c.name.toLowerCase().includes(q));
  }, [customerSearch, customers]);

  const selectedCustomer = useMemo(() => {
    if (!customerId) return null;
    return customers.find((c) => String(c.id) === customerId) ?? null;
  }, [customerId, customers]);

  const quantityNum = Number(quantity) || 0;
  const rateNum = Number(ratePerBag) || 0;
  const rickshawNum = Number(rickshawFare) || 0;
  const cashNum = Number(cashReceived) || 0;
  const billTotal = quantityNum * rateNum + rickshawNum;
  const remaining = billTotal - cashNum;

  const handleSave = () => {
    if (!sale) return;
    if (!customerId) { toast.error("Customer select karein"); return; }
    if (!productId) { toast.error("Product select karein"); return; }
    if (quantityNum <= 0) { toast.error("Quantity 0 se zyada honi chahiye"); return; }
    if (rateNum < 0) { toast.error("Rate galat hai"); return; }

    onSave({
      id: sale.id,
      customer_id: Number(customerId),
      product_id: Number(productId),
      location_id: locationId ? Number(locationId) : null,
      quantity: quantityNum,
      rate_per_bag: rateNum,
      rickshaw_fare: rickshawNum,
      rickshaw_driver_name: rickshawDriver.trim() || null,
      cash_received: cashNum,
      sale_date: saleDate || pktToday(),
      unit_type: unitType,
      bag_weight_kg: unitType === "kg" ? (Number(bagWeightKg) || null) : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Sale #{sale?.id ?? ""}</DialogTitle>
          <DialogDescription>
            Sale ke koi bhi field edit karein. Save karne par database update ho jayega.
            {selectedCustomer && (
              <span className="block mt-1 text-xs">
                Customer: <strong>{selectedCustomer.name}</strong>
                {selectedCustomer.type && <span className="ml-2 text-slate-400">({selectedCustomer.type})</span>}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          {/* Customer */}
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Customer</Label>
            <Input
              placeholder="Start typing a customer name..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
            />
            <Select value={customerId} onValueChange={(v) => {
              setCustomerId(v);
              const c = customers.find((x) => String(x.id) === v);
              if (c) setCustomerSearch(c.name);
            }}>
              <SelectTrigger><SelectValue placeholder="Select customer..." /></SelectTrigger>
              <SelectContent>
                {filteredCustomers.slice(0, 100).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name} {c.type === "credit" ? "(credit)" : "(cash)"}</SelectItem>
                ))}
                {filteredCustomers.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-slate-400">No matching customers</div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Product */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Select product..." /></SelectTrigger>
              <SelectContent>
                {products.filter((p) => p.is_active).map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger><SelectValue placeholder="Select location..." /></SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-slate-500 font-semibold tracking-wider">
              Quantity {unitType === "kg" ? "(kg)" : "(bags)"}
            </Label>
            <Input
              type="number"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          {/* Rate */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-slate-500 font-semibold tracking-wider">
              Rate {unitType === "kg" ? "(per kg)" : "(per bag)"}
            </Label>
            <Input
              type="number"
              step="0.01"
              value={ratePerBag}
              onChange={(e) => setRatePerBag(e.target.value)}
            />
          </div>

          {/* Unit Type */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Unit</Label>
            <RadioGroup
              value={unitType}
              onValueChange={(v) => setUnitType(v as "bags" | "kg")}
              className="flex gap-4 pt-2"
            >
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="bags" id="edit-unit-bags" />
                <Label htmlFor="edit-unit-bags" className="text-sm cursor-pointer">Bags</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="kg" id="edit-unit-kg" />
                <Label htmlFor="edit-unit-kg" className="text-sm cursor-pointer">Kg</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Bag Weight (only for kg unit) */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-slate-500 font-semibold tracking-wider">
              Bag Weight (kg) {unitType !== "kg" && <span className="text-slate-400">(only for kg unit)</span>}
            </Label>
            <Input
              type="number"
              step="0.01"
              value={bagWeightKg}
              onChange={(e) => setBagWeightKg(e.target.value)}
              disabled={unitType !== "kg"}
            />
          </div>

          {/* Rickshaw Fare */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Rickshaw Fare (Rs.)</Label>
            <Input
              type="number"
              step="0.01"
              value={rickshawFare}
              onChange={(e) => setRickshawFare(e.target.value)}
            />
          </div>

          {/* Rickshaw Driver Name */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Rickshaw Driver Name</Label>
            <Input
              value={rickshawDriver}
              onChange={(e) => setRickshawDriver(e.target.value)}
              placeholder="Optional driver name..."
            />
          </div>

          {/* Cash Received */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Cash Received (Rs.)</Label>
            <Input
              type="number"
              step="0.01"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
            />
          </div>

          {/* Sale Date */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-slate-500 font-semibold tracking-wider">Sale Date</Label>
            <Input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
            />
          </div>

          {/* Live totals */}
          <div className="md:col-span-2 grid grid-cols-3 gap-2 mt-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-center">
              <div className="text-xs text-slate-500 font-semibold uppercase">Bill Total</div>
              <div className="text-lg font-extrabold text-slate-900">Rs. {fmt(billTotal)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-500 font-semibold uppercase">Cash Received</div>
              <div className="text-lg font-extrabold text-green-600">Rs. {fmt(cashNum)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-500 font-semibold uppercase">Remaining</div>
              <div className={cn("text-lg font-extrabold", remaining > 0 ? "text-red-600" : "text-green-600")}>Rs. {fmt(remaining)}</div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="size-4 mr-1.5" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
