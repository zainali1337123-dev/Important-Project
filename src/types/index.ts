// ─── Application Types ───
// All domain types are intentionally generic and decoupled from any
// specific storage implementation. Fields map to UI concerns only.

export interface BaseEntity {
  id: number | string;
  created_at: string;
}

export interface NamedEntity extends BaseEntity {
  name: string;
  is_active: boolean;
}

export interface Product extends NamedEntity {
  default_rate: number;
  deleted_at?: string | null;
}

export interface ProductStock extends BaseEntity {
  product_id: number;
  location_id: number | null;
  stock_quantity: number;
  last_bag_weight_kg: number | null;
  products?: Product;
}

export interface Location extends BaseEntity {
  name: string;
}

export interface Customer extends NamedEntity {
  type: "credit" | "cash";
  phone: string | null;
  opening_balance: number;
  advance_payment?: number;
  deleted_at?: string | null;
}

export interface CustomerPayment extends BaseEntity {
  customer_id: number;
  payment_date: string;
  amount: number;
  applied_to_opening: number;
  applied_to_advance: number;
  opening_balance_before: number | null;
  opening_balance_after: number | null;
  advance_before: number | null;
  advance_after: number | null;
  notes: string | null;
  entered_by: string | null;
  customers?: { id: number; name: string; type: string };
}

export interface Sale extends BaseEntity {
  customer_id: number;
  product_id: number;
  quantity: number;
  rate_per_bag: number;
  rickshaw_fare: number;
  cash_received: number;
  sale_date: string;
  location_id: number | null;
  entered_by: string | null;
  unit_type: "bags" | "kg";
  bag_weight_kg: number | null;
  mix_order_id: string | null;
  transaction_group_id: string | null;
  rickshaw_driver_name: string | null;
  customers?: Customer;
  products?: Product;
}

export interface Expense extends BaseEntity {
  description: string;
  amount: number;
  expense_date: string;
  entered_by: string | null;
}

export type LabourPaymentType = "salary" | "advance" | "expense";

export interface Labour extends NamedEntity {
  phone: string | null;
  role: string | null;
  daily_wage: number;
  location_id: number | null;
  locations?: Location;
}

export interface LabourPayment extends BaseEntity {
  labour_id: number;
  payment_date: string;
  amount: number;
  payment_type: LabourPaymentType;
  description: string | null;
  entered_by: string | null;
  labours?: Labour;
}

export interface LabourDailyWage extends BaseEntity {
  labour_id: number;
  wage_date: string;
  amount: number;
  notes: string | null;
  entered_by: string | null;
  labours?: Labour;
}

export type LabourPaymentStatus = "not_paid" | "paid";

export interface LabourMonthlySummary {
  labour_id: number;
  month: string;
  total_earned: number;
  total_paid: number;
  balance_due: number;
  status: LabourPaymentStatus;
  wage_count: number;
  payment_count: number;
}

export interface Supplier extends NamedEntity {}

export interface Purchase extends BaseEntity {
  purchase_date: string;
  product_id: number;
  quantity: number;
  rate_per_bag: number;
  supplier_id: number | null;
  settled_by_customer_id: number | null;
  cash_paid: number;
  location_id: number | null;
  notes: string | null;
  entered_by: string | null;
  unit_type: "bags" | "kg";
  bag_weight_kg: number | null;
  products?: Product;
  suppliers?: Supplier | null;
  customers?: Customer | null;
}

// ─── Cash Management ───

export interface CashAccount extends BaseEntity {
  name: string;
}

export interface CashLedger extends BaseEntity {
  entry_date: string;
  account_id: number;
  direction: "in" | "out";
  amount: number;
  source_type: string;
  source_id: number | null;
  description: string | null;
  entered_by: string | null;
}

export interface CashTransfer extends BaseEntity {
  transfer_date: string;
  from_account_id: number;
  to_account_id: number;
  amount: number;
  notes: string | null;
  entered_by: string | null;
}

// ─── Computed / UI Types ───

export interface CustomerBalance {
  opening_balance: number;
  total_bill: number;
  total_cash_paid: number;
  total_goods_value: number;
  advance_payment?: number;
  balance_due: number;
}

export interface StatementLine {
  date: string;
  type: "sale" | "goods_settlement";
  product: string;
  quantity: number;
  unit_label: string;
  rate: number;
  rickshaw_fare: number;
  charge: number;
  payment: number;
  running_balance: number;
  mix_order_id?: string | null;
  is_mix_order?: boolean;
}

export interface CartItem {
  product: string;
  product_id: number;
  location?: string | null;
  location_id?: number | null;
  quantity: number;
  unit_type: "bags" | "kg";
  bag_weight_kg: number | null;
  rate: number;
  amount: number;
}

export interface MixIngredient {
  product: string;
  product_id: number;
  weight_kg: number;
  rate_per_kg: number;
  amount: number;
  rate_basis_weight?: number | null;
  quoted_rate?: number | null;
  bags?: number | null;
  rate_per_bag?: number | null;
  bag_amount?: number | null;
}

export interface AccountBalance {
  [accountName: string]: number;
}

export const CREDIT_LIMIT = 3_000_000;
export const UTILITY_BILL_TYPES = ["Electricity", "Gas", "Internet", "Water", "Rent", "Labour", "Other"];

// ─── Customer Auth & Subscription ───

export type SubscriptionType = "monthly" | "yearly" | "custom";

export interface AppCustomer {
  id: string;
  name: string;
  email: string;
  subscription_type: SubscriptionType;
  subscription_start: string;
  subscription_end: string;
  is_active: boolean;
  created_at: string;
}

export interface CustomerSession {
  customer: AppCustomer;
  isExpired: boolean;
}

// ─── Backup & Restore ───

export type BackupFilter = "all" | "today" | "month" | "year" | "custom";

export interface BackupFilters {
  type: BackupFilter;
  from?: string;
  to?: string;
}

export type RestoreMode = "merge" | "append";

export interface MixOrderRow extends BaseEntity {
  customer_id: number;
  location_id: number | null;
  order_date: string;
  target_weight_kg: number | null;
  cash_received: number;
  entered_by: string | null;
  driver_name: string | null;
  driver_rent: number;
}

export interface DataBackup {
  version: string;
  exported_at: string;
  exported_by: string;
  filters: {
    type: BackupFilter;
    from: string | null;
    to: string | null;
  };
  schema_version: string;
  data: Record<string, unknown[]>;
}
