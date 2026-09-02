import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { pktToday } from "@/lib/pkt-date";
import type { BackupFilter, DataBackup } from "@/types";

// Tables to export in logical order
const TABLES_CONFIG: {
  table: string;
  isMaster: boolean;
  dateCols: string[];
}[] = [
  // Master Tables (Always included full, ignoring date filter)
  { table: "locations", isMaster: true, dateCols: [] },
  { table: "products", isMaster: true, dateCols: [] },
  { table: "customers", isMaster: true, dateCols: [] },
  { table: "suppliers", isMaster: true, dateCols: [] },
  { table: "cash_accounts", isMaster: true, dateCols: [] },
  { table: "product_stock", isMaster: true, dateCols: [] },
  { table: "labours", isMaster: true, dateCols: [] },

  // Transactional Tables (Filtered by date if filter !== 'all')
  { table: "sales", isMaster: false, dateCols: ["sale_date", "date", "created_at"] },
  { table: "mix_orders", isMaster: false, dateCols: ["order_date", "date", "created_at"] },
  { table: "purchases", isMaster: false, dateCols: ["purchase_date", "date", "created_at"] },
  { table: "expenses", isMaster: false, dateCols: ["expense_date", "date", "created_at"] },
  { table: "customer_payments", isMaster: false, dateCols: ["payment_date", "date", "created_at"] },
  { table: "cash_ledger", isMaster: false, dateCols: ["entry_date", "date", "created_at"] },
  { table: "cash_transfers", isMaster: false, dateCols: ["transfer_date", "date", "created_at"] },
  { table: "labour_daily_wages", isMaster: false, dateCols: ["wage_date", "date", "created_at"] },
  { table: "labour_payments", isMaster: false, dateCols: ["payment_date", "date", "created_at"] },
];

async function fetchTableData(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  tableName: string,
  isMaster: boolean,
  dateCols: string[],
  fromDate: string | null,
  toDate: string | null
): Promise<any[]> {
  const allRows: any[] = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const fromIdx = page * pageSize;
      const toIdx = fromIdx + pageSize - 1;

      let res = await supabase
        .from(tableName)
        .select("*")
        .order("id", { ascending: true })
        .range(fromIdx, toIdx);

      // If ordering by id failed (e.g. table without 'id' column)
      if (res.error && page === 0) {
        res = await supabase
          .from(tableName)
          .select("*")
          .range(fromIdx, toIdx);
      }

      if (res.error) {
        // Table might not exist or be empty in this environment
        console.warn(`[Backup] Table ${tableName} query error:`, res.error.message);
        break;
      }

      const rows = res.data || [];
      allRows.push(...rows);

      if (rows.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    } catch (err: any) {
      console.warn(`[Backup] Exception reading table ${tableName}:`, err.message);
      break;
    }
  }

  // Apply date filtering for transactional tables
  if (!isMaster && (fromDate || toDate)) {
    return allRows.filter((row) => {
      let rowDate: string | null = null;
      for (const col of dateCols) {
        if (row[col]) {
          rowDate = String(row[col]).slice(0, 10);
          break;
        }
      }
      if (!rowDate && row.created_at) {
        rowDate = String(row.created_at).slice(0, 10);
      }
      if (!rowDate) return true; // Keep row if date cannot be determined
      if (fromDate && rowDate < fromDate) return false;
      if (toDate && rowDate > toDate) return false;
      return true;
    });
  }

  return allRows;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const filter = (searchParams.get("filter") || "all") as BackupFilter;
    const customFrom = searchParams.get("from");
    const customTo = searchParams.get("to");

    const today = pktToday();
    let fromDate: string | null = null;
    let toDate: string | null = null;

    switch (filter) {
      case "today":
        fromDate = today;
        toDate = today;
        break;
      case "month":
        fromDate = `${today.slice(0, 7)}-01`;
        toDate = today;
        break;
      case "year":
        fromDate = `${today.slice(0, 4)}-01-01`;
        toDate = today;
        break;
      case "custom":
        fromDate = customFrom || today;
        toDate = customTo || today;
        break;
      case "all":
      default:
        fromDate = null;
        toDate = null;
        break;
    }

    // Execute table queries in parallel batches
    const data: Record<string, any[]> = {};
    for (const item of TABLES_CONFIG) {
      const rows = await fetchTableData(
        supabase,
        item.table,
        item.isMaster,
        item.dateCols,
        fromDate,
        toDate
      );
      data[item.table] = rows;
    }

    const backup: DataBackup = {
      version: "1.0",
      exported_at: new Date().toISOString(),
      exported_by: "Admin",
      filters: {
        type: filter,
        from: fromDate,
        to: toDate,
      },
      schema_version: "2026-03-01",
      data,
    };

    const filename = `backup_${today}_${filter}.json`;
    const jsonOutput = JSON.stringify(backup, null, 2);

    return new NextResponse(jsonOutput, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (err: any) {
    console.error("Backup generation error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate backup" },
      { status: 500 }
    );
  }
}
