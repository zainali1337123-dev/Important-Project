import { NextRequest, NextResponse } from "next/server";
import { pktToday } from "@/lib/pkt-date";
import type { DataBackup, RestoreMode } from "@/types";

// Dependency order for foreign keys
const TABLE_DEPENDENCY_ORDER = [
  "locations",
  "products",
  "customers",
  "suppliers",
  "cash_accounts",
  "labours",
  "product_stock",
  "mix_orders",
  "sales",
  "purchases",
  "expenses",
  "customer_payments",
  "cash_ledger",
  "cash_transfers",
  "labour_daily_wages",
  "labour_payments",
];

function formatSqlValue(val: any): string {
  if (val === null || val === undefined) {
    return "NULL";
  }
  if (typeof val === "boolean") {
    return val ? "TRUE" : "FALSE";
  }
  if (typeof val === "number") {
    if (Number.isNaN(val)) return "NULL";
    return String(val);
  }
  if (typeof val === "object") {
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  // String or date
  const escaped = String(val).replace(/'/g, "''");
  return `'${escaped}'`;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const mode = (formData.get("mode") || "merge") as RestoreMode;

    if (!file) {
      return NextResponse.json(
        { error: "No backup file uploaded." },
        { status: 400 }
      );
    }

    const fileText = await file.text();
    let parsed: DataBackup;
    try {
      parsed = JSON.parse(fileText);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON format in the uploaded file." },
        { status: 400 }
      );
    }

    if (!parsed || !parsed.data || typeof parsed.data !== "object") {
      return NextResponse.json(
        { error: "Backup file is missing valid 'data' table entries." },
        { status: 400 }
      );
    }

    const today = pktToday();
    const sqlStatements: string[] = [];

    sqlStatements.push(`-- ==========================================================`);
    sqlStatements.push(`-- Danish Cattle Feed - Database Restore Script`);
    sqlStatements.push(`-- Generated: ${new Date().toISOString()} (PKT Today: ${today})`);
    sqlStatements.push(`-- Mode: ${mode.toUpperCase()}`);
    sqlStatements.push(`-- Backup Source: version ${parsed.version || "1.0"}, exported ${parsed.exported_at || "unknown"}`);
    sqlStatements.push(`-- ==========================================================`);
    sqlStatements.push(`\nBEGIN;\n`);
    sqlStatements.push(`-- Disable triggers temporarily if permission allows (optional)`);
    sqlStatements.push(`SET session_replication_role = 'replica';\n`);

    let totalRows = 0;

    // Process tables according to dependency order first, then any extra tables
    const dataKeys = Object.keys(parsed.data);
    const orderedTables = [
      ...TABLE_DEPENDENCY_ORDER.filter((t) => dataKeys.includes(t)),
      ...dataKeys.filter((t) => !TABLE_DEPENDENCY_ORDER.includes(t)),
    ];

    for (const tableName of orderedTables) {
      const rows = parsed.data[tableName];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      sqlStatements.push(`-- ----------------------------------------------------------`);
      sqlStatements.push(`-- Table: ${tableName} (${rows.length} rows)`);
      sqlStatements.push(`-- ----------------------------------------------------------`);

      for (const row of rows) {
        if (!row || typeof row !== "object") continue;

        const keys = Object.keys(row).filter((k) => k !== undefined && row[k] !== undefined);
        if (keys.length === 0) continue;

        const quotedCols = keys.map((k) => `"${k}"`).join(", ");
        const formattedVals = keys.map((k) => formatSqlValue(row[k])).join(", ");

        const hasId = keys.includes("id");

        if (hasId) {
          if (mode === "merge") {
            const updateClauses = keys
              .filter((k) => k !== "id")
              .map((k) => `"${k}" = EXCLUDED."${k}"`);

            if (updateClauses.length > 0) {
              sqlStatements.push(
                `INSERT INTO "${tableName}" (${quotedCols}) VALUES (${formattedVals}) ON CONFLICT ("id") DO UPDATE SET ${updateClauses.join(", ")};`
              );
            } else {
              sqlStatements.push(
                `INSERT INTO "${tableName}" (${quotedCols}) VALUES (${formattedVals}) ON CONFLICT ("id") DO NOTHING;`
              );
            }
          } else {
            // Append mode: insert only if id doesn't already exist
            sqlStatements.push(
              `INSERT INTO "${tableName}" (${quotedCols}) VALUES (${formattedVals}) ON CONFLICT ("id") DO NOTHING;`
            );
          }
        } else {
          // No primary id column, simple insert
          sqlStatements.push(
            `INSERT INTO "${tableName}" (${quotedCols}) VALUES (${formattedVals});`
          );
        }

        totalRows++;
      }
      sqlStatements.push("");
    }

    sqlStatements.push(`-- Re-enable normal trigger behavior`);
    sqlStatements.push(`SET session_replication_role = 'origin';\n`);

    sqlStatements.push(`-- Synchronize serial sequence IDs to avoid primary key collisions on new entries`);
    sqlStatements.push(`DO $$
DECLARE
  seq RECORD;
BEGIN
  FOR seq IN
    SELECT sequence_name, table_name, column_name
    FROM information_schema.columns
    WHERE column_default LIKE 'nextval%'
  LOOP
    BEGIN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I), 1))', seq.sequence_name, seq.column_name, seq.table_name);
    EXCEPTION WHEN OTHERS THEN
      -- ignore sequence permission or view errors
    END;
  END LOOP;
END $$;\n`);

    sqlStatements.push(`COMMIT;\n`);

    const sqlScript = sqlStatements.join("\n");
    const filename = `restore_${today}_${mode}.sql`;

    return new NextResponse(sqlScript, {
      status: 200,
      headers: {
        "Content-Type": "application/sql; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Restore-Rows": String(totalRows),
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: any) {
    console.error("Restore script generation error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to build restore script" },
      { status: 500 }
    );
  }
}
