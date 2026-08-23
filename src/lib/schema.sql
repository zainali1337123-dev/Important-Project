-- ====================================================================
-- DANISH CATTLE FEED - DATABASE SCHEMA & FULL SYSTEM MIGRATION
-- ====================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Locations Table
CREATE TABLE IF NOT EXISTS locations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO locations (id, name) VALUES
  (1, 'Farm'),
  (2, 'Shop')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 3. Cash Accounts Table
CREATE TABLE IF NOT EXISTS cash_accounts (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  account_type TEXT NOT NULL DEFAULT 'cash',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO cash_accounts (id, name, account_type) VALUES
  (1, 'Cash In Hand', 'cash'),
  (2, 'Cash In Locker', 'reserve'),
  (3, 'Cash Online', 'bank')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 4. Products Table
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'Feed',
  default_bag_weight_kg NUMERIC(10, 2) NOT NULL DEFAULT 40.00,
  default_rate_per_bag NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 5. Product Stock (Inventory) Table
CREATE TABLE IF NOT EXISTS product_stock (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  location TEXT NOT NULL DEFAULT 'Shop',
  stock_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  last_bag_weight_kg NUMERIC(10, 2) NOT NULL DEFAULT 40.00,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(product_id, location_id)
);

-- 6. Customers Table
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'credit',
  phone TEXT,
  opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  advance_payment NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  credit_limit NUMERIC(14, 2) NOT NULL DEFAULT 3000000.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 7. Suppliers Table
CREATE TABLE IF NOT EXISTS suppliers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 8. Labours Table
CREATE TABLE IF NOT EXISTS labours (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  daily_wage NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  monthly_salary NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 9. Custom Mix Orders Table
CREATE TABLE IF NOT EXISTS mix_orders (
  id BIGSERIAL PRIMARY KEY,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  location_id BIGINT NOT NULL DEFAULT 2 REFERENCES locations(id) ON DELETE RESTRICT,
  location TEXT NOT NULL DEFAULT 'Shop',
  target_weight_kg NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  driver_name TEXT,
  driver_rent NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 10. Sales Table
CREATE TABLE IF NOT EXISTS sales (
  id BIGSERIAL PRIMARY KEY,
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  location_id BIGINT NOT NULL DEFAULT 2 REFERENCES locations(id) ON DELETE RESTRICT,
  location TEXT NOT NULL DEFAULT 'Shop',
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  unit_type TEXT NOT NULL DEFAULT 'bags',
  bag_weight_kg NUMERIC(10, 2) NOT NULL DEFAULT 40.00,
  rate_per_bag NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  rickshaw_fare NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  cash_received NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  mix_order_id BIGINT REFERENCES mix_orders(id) ON DELETE SET NULL,
  transaction_group_id TEXT,
  entered_by TEXT DEFAULT 'Zain',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 11. Expenses Table
CREATE TABLE IF NOT EXISTS expenses (
  id BIGSERIAL PRIMARY KEY,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  location_id BIGINT NOT NULL DEFAULT 2 REFERENCES locations(id) ON DELETE RESTRICT,
  location TEXT NOT NULL DEFAULT 'Shop',
  category TEXT NOT NULL DEFAULT 'General',
  description TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  entered_by TEXT DEFAULT 'Zain',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 12. Customer Payments Table
CREATE TABLE IF NOT EXISTS customer_payments (
  id BIGSERIAL PRIMARY KEY,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL DEFAULT 2 REFERENCES locations(id) ON DELETE RESTRICT,
  location TEXT NOT NULL DEFAULT 'Shop',
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  applied_to_opening NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  applied_to_advance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  notes TEXT,
  entered_by TEXT DEFAULT 'Zain',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 13. Purchases / Goods Received Table
CREATE TABLE IF NOT EXISTS purchases (
  id BIGSERIAL PRIMARY KEY,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_id BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,
  settled_by_customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  location_id BIGINT NOT NULL DEFAULT 2 REFERENCES locations(id) ON DELETE RESTRICT,
  location TEXT NOT NULL DEFAULT 'Shop',
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  rate_per_bag NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  cash_paid NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  remarks TEXT,
  entered_by TEXT DEFAULT 'Zain',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 14. Labour Payments Table
CREATE TABLE IF NOT EXISTS labour_payments (
  id BIGSERIAL PRIMARY KEY,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  labour_id BIGINT NOT NULL REFERENCES labours(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL DEFAULT 2 REFERENCES locations(id) ON DELETE RESTRICT,
  location TEXT NOT NULL DEFAULT 'Shop',
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  payment_type TEXT NOT NULL DEFAULT 'salary',
  description TEXT,
  entered_by TEXT DEFAULT 'Zain',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 15. Cash Ledger / Cash Transactions Table
CREATE TABLE IF NOT EXISTS cash_ledger (
  id BIGSERIAL PRIMARY KEY,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  account_id BIGINT NOT NULL DEFAULT 1 REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  location_id BIGINT NOT NULL DEFAULT 2 REFERENCES locations(id) ON DELETE RESTRICT,
  location TEXT NOT NULL DEFAULT 'Shop',
  type TEXT NOT NULL DEFAULT 'in', -- 'in' or 'out'
  direction TEXT NOT NULL DEFAULT 'in', -- 'in' or 'out'
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  source_type TEXT NOT NULL, -- 'sale', 'expense', 'customer_payment', 'purchase', 'labour_payment', 'transfer', 'correction'
  source_id BIGINT,
  description TEXT,
  reference_type TEXT,
  reference_id BIGINT,
  entered_by TEXT DEFAULT 'Zain',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 16. Cash Transfers Table
CREATE TABLE IF NOT EXISTS cash_transfers (
  id BIGSERIAL PRIMARY KEY,
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  from_account_id BIGINT NOT NULL REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  to_account_id BIGINT NOT NULL REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  notes TEXT,
  entered_by TEXT DEFAULT 'Zain',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 17. Day Reconciliations Table
CREATE TABLE IF NOT EXISTS day_reconciliations (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  location_id BIGINT NOT NULL DEFAULT 2 REFERENCES locations(id) ON DELETE RESTRICT,
  location TEXT NOT NULL DEFAULT 'Shop',
  total_bags_sold NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_billed NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  cash_received NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  from_credit_customers NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  from_cash_customers NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  total_expenses NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  total_cash_in NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  total_cash_out NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  expected_cash_in_hand NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  closing_cash_actual NUMERIC(14, 2),
  cash_difference NUMERIC(14, 2),
  notes TEXT,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(date, location_id)
);

-- ====================================================================
-- PERFORMANCE INDEXES ON (date, location) & FOREIGN KEYS
-- ====================================================================

CREATE INDEX IF NOT EXISTS idx_sales_date_loc ON sales(sale_date, location_id);
CREATE INDEX IF NOT EXISTS idx_sales_alt_date_loc ON sales(date, location);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_product ON sales(product_id);

CREATE INDEX IF NOT EXISTS idx_expenses_date_loc ON expenses(expense_date, location_id);
CREATE INDEX IF NOT EXISTS idx_expenses_alt_date_loc ON expenses(date, location);

CREATE INDEX IF NOT EXISTS idx_customer_payments_date_loc ON customer_payments(payment_date, location_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_alt_date_loc ON customer_payments(date, location);
CREATE INDEX IF NOT EXISTS idx_customer_payments_cust ON customer_payments(customer_id);

CREATE INDEX IF NOT EXISTS idx_purchases_date_loc ON purchases(purchase_date, location_id);
CREATE INDEX IF NOT EXISTS idx_purchases_alt_date_loc ON purchases(date, location);

CREATE INDEX IF NOT EXISTS idx_labour_payments_date_loc ON labour_payments(payment_date, location_id);

CREATE INDEX IF NOT EXISTS idx_cash_ledger_date_loc ON cash_ledger(entry_date, location_id);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_account ON cash_ledger(account_id);

CREATE INDEX IF NOT EXISTS idx_cash_transfers_date ON cash_transfers(transfer_date);

CREATE INDEX IF NOT EXISTS idx_product_stock_prod_loc ON product_stock(product_id, location_id);

CREATE INDEX IF NOT EXISTS idx_day_reconciliations_date_loc ON day_reconciliations(date, location_id);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE labours ENABLE ROW LEVEL SECURITY;
ALTER TABLE mix_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE labour_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_reconciliations ENABLE ROW LEVEL SECURITY;

-- Allow full access for authenticated and standard app roles
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow all authenticated operations on %I" ON %I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "Allow all authenticated operations on %I" ON %I FOR ALL USING (true) WITH CHECK (true);', tbl, tbl);
  END LOOP;
END $$;
