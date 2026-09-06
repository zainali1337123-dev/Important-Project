"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { QuickNav } from "@/components/shared/quick-nav";
import type { Customer } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { toast } from "sonner";
import ConfirmAction from "@/components/shared/confirm-action";
import { invalidateCache, apiError } from "@/store";
import { numberToWords } from "@/lib/number-to-words";
import {
  UserPen,
  Users,
  Save,
  Loader2,
  Search,
  ArrowRight,
  AlertCircle,
} from "lucide-react";

const fmt = (n?: number | null) => (n === null || n === undefined || isNaN(Number(n)) ? "0" : Number(n).toLocaleString("en-PK"));

// ── Balance row returned by /api/reports/customer-balance ──
interface BalanceRow {
  opening_balance: number;
  total_bill: number;
  total_cash_paid: number;
  total_goods_value: number;
  advance_payment?: number;
  balance_due: number;
}

export default function EditCustomerPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [balances, setBalances] = useState<Record<number, BalanceRow>>({});
  const [loading, setLoading] = useState(true);

  // ── Selected customer + edited OB and Advance ──
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [newOb, setNewOb] = useState<string>("");
  const [newAdv, setNewAdv] = useState<string>("");

  // ── Confirm dialog state ──
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // ────────────────────────────────────────────────────────────
  // Load all customers + their balance summaries
  // ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const cusRaw = await fetch("/api/customers");
      if (!cusRaw.ok) { toast.error("Failed to load customers"); return; }
      const cusRes = await cusRaw.json();
      setCustomers(cusRes.customers ?? []);

      const balRaw = await fetch("/api/reports/customer-balance");
      if (!balRaw.ok) { toast.error("Failed to load balances"); return; }
      const bal = await balRaw.json();
      setBalances(typeof bal === "object" && !Array.isArray(bal) ? bal : {});
    } catch {
      toast.error("Failed to load customer data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ────────────────────────────────────────────────────────────
  // Selected customer + their current balance
  // ────────────────────────────────────────────────────────────
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === Number(selectedCustomerId)) ?? null,
    [customers, selectedCustomerId]
  );

  const selectedBalance = useMemo<BalanceRow | null>(
    () => selectedCustomerId ? balances[Number(selectedCustomerId)] ?? null : null,
    [selectedCustomerId, balances]
  );

  // When a customer is selected, pre-fill both OB and Advance inputs with current values
  const handleSelectCustomer = (id: string) => {
    setSelectedCustomerId(id);
    const c = customers.find((x) => String(x.id) === id);
    if (c) {
      setNewOb(String(c.opening_balance ?? 0));
      setNewAdv(String(c.advance_payment ?? 0));
    } else {
      setNewOb("");
      setNewAdv("");
    }
  };

  // Has the user changed the values from saved?
  const savedOb = selectedCustomer?.opening_balance ?? 0;
  const newObNum = parseFloat(newOb) || 0;
  const obChanged = selectedCustomer !== null && Math.abs(newObNum - savedOb) > 0.001;
  const obDiff = newObNum - savedOb;

  const savedAdv = selectedCustomer?.advance_payment ?? 0;
  const newAdvNum = parseFloat(newAdv) || 0;
  const advChanged = selectedCustomer !== null && Math.abs(newAdvNum - savedAdv) > 0.001;
  const advDiff = newAdvNum - savedAdv;

  const hasChanged = obChanged || advChanged;

  // Predicted new balance_due after OB and Advance updates
  const predictedBalanceDue = useMemo(() => {
    if (!selectedBalance) return 0;
    // balance_due = opening_balance + total_bill - cash_paid - goods_value - advance_payment
    const totalBill = selectedBalance.total_bill ?? 0;
    const cashPaid = selectedBalance.total_cash_paid ?? 0;
    const goods = selectedBalance.total_goods_value ?? 0;
    return newObNum + totalBill - cashPaid - goods - newAdvNum;
  }, [selectedBalance, newObNum, newAdvNum]);

  // Quick 1-click clear advance payment directly from table or card
  const handleQuickClearAdvance = async (cust: Customer) => {
    try {
      const res = await fetch("/api/customers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cust.id, advance_payment: 0 }),
      });
      if (!res.ok) throw new Error(await apiError(res, "Failed to clear advance payment"));
      invalidateCache("customers");
      toast.success(`Advance payment removed for ${cust.name}. Reset to Rs. 0.`);
      await loadData();
      if (String(cust.id) === selectedCustomerId) {
        setNewAdv("0");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to clear advance payment");
    }
  };

  // ────────────────────────────────────────────────────────────
  // Filtered dropdown list
  // ────────────────────────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    const active = customers.filter((c) => c.is_active);
    if (!search.trim()) return active;
    const q = search.toLowerCase();
    return active.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q)
    );
  }, [customers, search]);

  // ────────────────────────────────────────────────────────────
  // Save handler — opens the confirm dialog first
  // ────────────────────────────────────────────────────────────
  const handleSaveClick = () => {
    if (!selectedCustomer) {
      toast.error("Pehle ek customer select karein.");
      return;
    }
    if (!hasChanged) {
      toast.info("Value same hai — kuch change nahi hua. Edit karke phir try karein.");
      return;
    }
    if (newObNum < 0) {
      toast.error("Opening balance 0 ya us se zyada honi chahiye.");
      return;
    }
    if (newAdvNum < 0) {
      toast.error("Advance payment 0 ya us se zyada honi chahiye.");
      return;
    }
    setConfirmOpen(true);
  };

  // ────────────────────────────────────────────────────────────
  // Actually persist the OB + Advance update (called after confirm)
  // ────────────────────────────────────────────────────────────
  const handleConfirmSave = async () => {
    if (!selectedCustomer) return;
    setConfirmLoading(true);
    try {
      const res = await fetch("/api/customers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedCustomer.id,
          opening_balance: newObNum,
          advance_payment: newAdvNum,
        }),
      });
      if (!res.ok) {
        throw new Error(await apiError(res, "Failed to update customer balance"));
      }
      const data = await res.json();
      // Update local customer list so the table + dropdown reflect the new values
      if (data?.customer) {
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === selectedCustomer.id
              ? { ...c, opening_balance: newObNum, advance_payment: newAdvNum }
              : c
          )
        );
      }
      // Also update the balances map so the predicted/preview numbers refresh
      if (selectedBalance) {
        const updatedBal: BalanceRow = {
          ...selectedBalance,
          opening_balance: newObNum,
          advance_payment: newAdvNum,
          balance_due: predictedBalanceDue,
        };
        setBalances((prev) => ({ ...prev, [selectedCustomer.id]: updatedBal }));
      }
      // Invalidate cached customer list so other pages pick up the change
      invalidateCache("customers");
      toast.success(
        `Balance updated for ${selectedCustomer.name}`,
        {
          description: `OB: Rs. ${fmt(newObNum)} | Advance: Rs. ${fmt(newAdvNum)}`,
          duration: 6000,
        }
      );
      setConfirmOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to update customer balance");
    } finally {
      setConfirmLoading(false);
    }
  };

  // ────────────────────────────────────────────────────────────
  // Loading state
  // ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Customer"
        subtitle="Sirf opening balance edit karein — bina sale kiye (sale ki zarurat nahi)"
      />

      <QuickNav
        title="Jump to"
        items={[
          { id: "section-update-ob", label: "Update Opening Balance", icon: UserPen },
          { id: "section-quick-edit", label: "Quick Edit All", icon: Users, iconColor: "text-[#087F83]" },
        ]}
      />

      {/* ──────────────────────────────────────────────────────── */}
      {/* Section 1: Select customer + edit OB inline             */}
      {/* ──────────────────────────────────────────────────────── */}
      <Card id="section-update-ob" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserPen className="size-5 text-slate-600" />
            Update Opening Balance
          </CardTitle>
          <CardDescription>
            Customer select karein → opening balance edit karein → Save karein.
            Ye Daily Entry ke sale-complete flow ke bina direct OB overwrite karne ka
            tareeqa hai. Sirf OB field update hoga, baqi fields (name, type, phone)
            untouched rahenge.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Search + Select */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase text-slate-500 font-semibold">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  placeholder="Name ya phone type karein..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase text-slate-500 font-semibold">Select Customer</Label>
              <Select value={selectedCustomerId} onValueChange={handleSelectCustomer}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Click to pick a customer..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredCustomers.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                      {c.phone ? ` — ${c.phone}` : ""}
                      {" "}
                      <span className="text-xs text-slate-400">({c.type})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Edit panel — shown only after a customer is picked */}
          {selectedCustomer ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:p-6 space-y-5">
              {/* Customer info header */}
              <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-slate-200">
                <div className="flex-1 min-w-[200px]">
                  <div className="text-lg font-bold text-slate-900">{selectedCustomer.name}</div>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                    <Badge variant={selectedCustomer.type === "credit" ? "default" : "secondary"} className="text-xs">
                      {selectedCustomer.type}
                    </Badge>
                    {selectedCustomer.phone && <span>· {selectedCustomer.phone}</span>}
                    <span>· Joined {selectedCustomer.created_at?.slice(0, 10)}</span>
                  </div>
                </div>
              </div>

              {/* Current vs New side-by-side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Opening Balance Current */}
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-amber-700 font-bold">
                    Current Opening Balance
                  </div>
                  <div className="text-2xl font-extrabold text-amber-900 tabular-nums">
                    Rs. {fmt(savedOb)}
                  </div>
                  <div className="text-[0.65rem] text-amber-700/80 capitalize">
                    {savedOb > 0 ? numberToWords(savedOb) : "zero"}
                  </div>
                </div>

                {/* Opening Balance New */}
                <div className={cn(
                  "rounded-lg border p-4 space-y-2 transition-colors",
                  obChanged ? "border-blue-300 bg-blue-50/60" : "border-slate-200 bg-white"
                )}>
                  <div className="text-[10px] uppercase tracking-wider text-slate-600 font-bold flex items-center gap-2">
                    New Opening Balance
                    {obChanged && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 text-white px-2 py-0.5 text-[10px] font-bold tracking-normal normal-case">
                        {obDiff >= 0 ? "Increase" : "Decrease"} {obDiff >= 0 ? "+" : ""}Rs. {fmt(obDiff)}
                      </span>
                    )}
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0"
                    value={newOb}
                    onChange={(e) => setNewOb(e.target.value)}
                    className="text-lg font-bold tabular-nums"
                  />
                  <div className="text-[0.65rem] text-slate-500 capitalize">
                    {newObNum > 0 ? numberToWords(newObNum) : "zero"}
                  </div>
                </div>

                {/* Advance Payment Current */}
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold">
                      Current Advance Payment (پیشگی)
                    </div>
                    {savedAdv > 0 && (
                      <button
                        type="button"
                        onClick={() => handleQuickClearAdvance(selectedCustomer)}
                        className="text-[10px] font-bold text-rose-600 hover:text-rose-800 underline cursor-pointer"
                        title="Database se advance payment 0 karein"
                      >
                        Remove Advance (Set to 0)
                      </button>
                    )}
                  </div>
                  <div className="text-2xl font-extrabold text-emerald-900 tabular-nums">
                    Rs. {fmt(savedAdv)}
                  </div>
                  <div className="text-[0.65rem] text-emerald-700/80 capitalize">
                    {savedAdv > 0 ? numberToWords(savedAdv) : "zero (no advance)"}
                  </div>
                </div>

                {/* Advance Payment New */}
                <div className={cn(
                  "rounded-lg border p-4 space-y-2 transition-colors",
                  advChanged ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-white"
                )}>
                  <div className="text-[10px] uppercase tracking-wider text-slate-600 font-bold flex items-center justify-between">
                    <span>New Advance Payment</span>
                    {newAdvNum > 0 && (
                      <button
                        type="button"
                        onClick={() => setNewAdv("0")}
                        className="text-[10px] font-semibold text-rose-600 hover:text-rose-700 underline cursor-pointer"
                      >
                        Reset to 0
                      </button>
                    )}
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0"
                    value={newAdv}
                    onChange={(e) => setNewAdv(e.target.value)}
                    className="text-lg font-bold tabular-nums"
                  />
                  <div className="text-[0.65rem] text-slate-500 capitalize">
                    {newAdvNum > 0 ? numberToWords(newAdvNum) : "zero"}
                  </div>
                </div>
              </div>

              {/* Impact preview — only show if a balance row exists */}
              {selectedBalance && (
                <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                  <div className="text-xs uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5">
                    <AlertCircle className="size-3.5" />
                    Balance Impact Preview
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">Total Billed</div>
                      <div className="font-semibold text-slate-700 tabular-nums">Rs. {fmt(selectedBalance.total_bill)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">Cash Paid</div>
                      <div className="font-semibold text-emerald-700 tabular-nums">Rs. {fmt(selectedBalance.total_cash_paid)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">Paid in Goods</div>
                      <div className="font-semibold text-purple-700 tabular-nums">Rs. {fmt(selectedBalance.total_goods_value)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">Advance Payment</div>
                      <div className="font-semibold text-emerald-700 tabular-nums">Rs. {fmt(newAdvNum)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">Current Balance Due</div>
                      <div className="font-semibold text-orange-700 tabular-nums">Rs. {fmt(selectedBalance.balance_due)}</div>
                    </div>
                  </div>
                  {/* Predicted new balance_due */}
                  <div className="flex items-center justify-between rounded-md bg-slate-900 text-white px-4 py-2.5">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold">
                      Predicted Balance Due
                      <span className="text-[10px] text-slate-300 normal-case font-normal tracking-normal">
                        (new OB + bill − cash − goods − new advance)
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 tabular-nums">Rs. {fmt(selectedBalance.balance_due)}</span>
                      <ArrowRight className="size-3.5 text-slate-400" />
                      <span className={cn(
                        "text-lg font-extrabold tabular-nums",
                        predictedBalanceDue > selectedBalance.balance_due ? "text-red-300" : "text-emerald-300"
                      )}>
                        Rs. {fmt(predictedBalanceDue)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setNewOb(String(savedOb));
                    setNewAdv(String(savedAdv));
                    toast.info("Values reset to saved values.");
                  }}
                  disabled={!hasChanged}
                  className="cursor-pointer"
                >
                  Reset to Saved
                </Button>
                <Button
                  onClick={handleSaveClick}
                  disabled={!hasChanged}
                  className={cn(
                    "cursor-pointer",
                    hasChanged ? "bg-blue-600 hover:bg-blue-700 text-white" : ""
                  )}
                >
                  <Save className="size-4 mr-2" />
                  Save Balance Changes
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-10 text-center text-slate-400">
              <UserPen className="size-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                OB edit karne ke liye upar se ek customer select karein.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ──────────────────────────────────────────────────────── */}
      {/* Section 2: All customers quick-OB table                  */}
      {/* ──────────────────────────────────────────────────────── */}
      <Card id="section-quick-edit" className="rounded-2xl border-slate-200/60 shadow-sm scroll-mt-24">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="size-5 text-slate-600" />
            All Customers — Quick Edit
          </CardTitle>
          <CardDescription>
            Kisi bhi customer ke saath Edit icon pe click karein — upar edit panel
            me khul jayega.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              Abhi tak koi customer record nahi hai.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left text-xs uppercase text-slate-500 font-semibold px-4 py-3">Customer</th>
                    <th className="text-left text-xs uppercase text-slate-500 font-semibold px-4 py-3">Type</th>
                    <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">Opening Balance</th>
                    <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">Advance Payment</th>
                    <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">Balance Due</th>
                    <th className="text-right text-xs uppercase text-slate-500 font-semibold px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {customers
                    .filter((c) => c.is_active)
                    .map((c) => {
                      const b = balances[c.id];
                      const due = b?.balance_due ?? c.opening_balance ?? 0;
                      const ob = c.opening_balance ?? 0;
                      const adv = c.advance_payment ?? 0;
                      const isSelected = String(c.id) === selectedCustomerId;
                      return (
                        <tr
                          key={c.id}
                          className={cn(
                            "border-b border-slate-50 last:border-b-0 transition-colors",
                            isSelected ? "bg-blue-50" : "hover:bg-slate-50/80"
                          )}
                        >
                          <td className="px-4 py-3 font-medium">
                            {c.name}
                            {c.phone && <span className="block text-[0.65rem] text-slate-400">{c.phone}</span>}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={c.type === "credit" ? "default" : "secondary"} className="text-xs">
                              {c.type}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {ob > 0 ? (
                              <span className="font-medium text-amber-700">Rs. {fmt(ob)}</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {adv > 0 ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <span className="font-semibold text-emerald-700">Rs. {fmt(adv)}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleQuickClearAdvance(c)}
                                  className="h-6 px-1.5 text-[10px] text-rose-600 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                                  title="Remove Advance (Set to 0)"
                                >
                                  Clear
                                </Button>
                              </div>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold">
                            Rs. {fmt(due)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSelectCustomer(String(c.id))}
                              className="cursor-pointer text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              title="Edit opening balance / advance"
                            >
                              <UserPen className="size-3.5 mr-1" />
                              Edit
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Confirm dialog ─── */}
      <ConfirmAction
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Customer Balance Settings Update Karein?"
        description={
          selectedCustomer
            ? `${selectedCustomer.name} ka balance record update kiya jayega: Opening Balance: Rs. ${fmt(newObNum)}, Advance Payment: Rs. ${fmt(newAdvNum)}. Nayi Balance Due Rs. ${fmt(predictedBalanceDue)} hogi.`
            : ""
        }
        confirmLabel="Haan, Update Karein"
        variant="warning"
        onConfirm={handleConfirmSave}
        loading={confirmLoading}
      />
    </div>
  );
}
