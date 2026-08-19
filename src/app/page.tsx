"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { useAppStore, masterCache } from "@/store";
import { useAuth } from "@/components/auth/auth-provider";
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  CheckCircle,
  Package,
  Settings,
  FlaskConical,
  Landmark,
  LogOut,
  User,
  Database,
  HardHat,
  UserPen,
  Users,
  Menu,
  X,
  Loader2,
} from "lucide-react";

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
    </div>
  );
}

const Dashboard = dynamic(() => import("@/components/pages/dashboard"), { ssr: false, loading: () => <PageLoader /> });
const DailyEntry = dynamic(() => import("@/components/pages/daily-entry"), { ssr: false, loading: () => <PageLoader /> });
const CustomerKhata = dynamic(() => import("@/components/pages/customer-khata"), { ssr: false, loading: () => <PageLoader /> });
const EditCustomer = dynamic(() => import("@/components/pages/edit-customer"), { ssr: false, loading: () => <PageLoader /> });
const ManageCustomers = dynamic(() => import("@/components/pages/manage-customers"), { ssr: false, loading: () => <PageLoader /> });
const DayReconciliation = dynamic(() => import("@/components/pages/day-reconciliation"), { ssr: false, loading: () => <PageLoader /> });
const CashManagement = dynamic(() => import("@/components/pages/cash-management"), { ssr: false, loading: () => <PageLoader /> });
const ManageProducts = dynamic(() => import("@/components/pages/manage-products"), { ssr: false, loading: () => <PageLoader /> });
const PurchasesStock = dynamic(() => import("@/components/pages/purchases-stock"), { ssr: false, loading: () => <PageLoader /> });
const CustomMixOrder = dynamic(() => import("@/components/pages/custom-mix-order"), { ssr: false, loading: () => <PageLoader /> });
const DatabaseManagement = dynamic(() => import("@/components/pages/database-management"), { ssr: false, loading: () => <PageLoader /> });
const LabourKhata = dynamic(() => import("@/components/pages/labour-khata"), { ssr: false, loading: () => <PageLoader /> });

const pageMap: Record<string, React.ComponentType<any>> = {
  dashboard: Dashboard,
  "daily-entry": DailyEntry,
  "customer-khata": CustomerKhata,
  "edit-customer": EditCustomer,
  "manage-customers": ManageCustomers,
  reconciliation: DayReconciliation,
  "cash-mgmt": CashManagement,
  "manage-products": ManageProducts,
  "purchases-stock": PurchasesStock,
  "custom-mix": CustomMixOrder,
  "database-mgmt": DatabaseManagement,
  "labour-khata": LabourKhata,
};

const navSections = [
  {
    label: "Overview",
    items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Daily Operations",
    items: [
      { id: "daily-entry", label: "Daily Entry", icon: FileText },
      { id: "custom-mix", label: "Custom Mix Order", icon: FlaskConical },
      { id: "reconciliation", label: "Day Reconciliation", icon: CheckCircle },
      { id: "cash-mgmt", label: "Cash Management", icon: Landmark },
    ],
  },
  {
    label: "Customers",
    items: [
      { id: "customer-khata", label: "Customer Khata", icon: BookOpen },
      { id: "manage-customers", label: "Manage Customers", icon: Users },
      { id: "edit-customer", label: "Edit Customer (OB)", icon: UserPen },
    ],
  },
  {
    label: "Labours",
    items: [{ id: "labour-khata", label: "Labours Khata", icon: HardHat }],
  },
  {
    label: "Inventory",
    items: [
      { id: "purchases-stock", label: "Purchases & Stock", icon: Package },
      { id: "manage-products", label: "Manage Products", icon: Settings },
    ],
  },
  {
    label: "System",
    items: [{ id: "database-mgmt", label: "Database Management", icon: Database }],
  },
];

export default function MainPage() {
  const { user, loading, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { activePage, setActivePage } = useAppStore();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  // Background cache prefetching for master data
  useEffect(() => {
    if (masterCache.products && Date.now() - masterCache.products.fetchedAt < 60_000) {
      return;
    }
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (p?.products) {
          masterCache.products = { data: p.products, fetchedAt: Date.now() };
        }
      })
      .catch(() => null);
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    await signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const PageComponent = pageMap[activePage] || Dashboard;

  return (
    <div id="app-root" className="min-h-screen bg-slate-50">
      {/* Mobile hamburger button */}
      <button
        id="mobile-menu-toggle"
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-white text-slate-800 p-2.5 rounded-xl shadow-lg border border-slate-200 cursor-pointer"
        aria-label="Toggle menu"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        id="app-sidebar"
        className={cn(
          "fixed top-0 left-0 z-40 h-screen w-64 transition-transform duration-200 lg:translate-x-0",
          "bg-gradient-to-b from-[#101a2e] to-[#0b1322] border-r border-white/[0.06]",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-4 h-screen flex flex-col overflow-hidden">
          {/* Logo Header */}
          <div className="flex items-center gap-3 pb-4 mb-4 border-b border-white/[0.08] shrink-0">
            <div className="w-10 h-10 min-w-[2.5rem] rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-lg shadow-lg shadow-emerald-500/30">
              🐄
            </div>
            <div>
              <div className="text-white font-extrabold text-sm leading-tight">Danish Cattle Feed</div>
              <div className="text-emerald-400 text-xs font-medium">Daily Register</div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-5 overflow-y-auto flex-1 min-h-0 scrollbar-thin">
            {navSections.map((section) => (
              <div key={section.label}>
                <div className="text-[0.68rem] font-bold tracking-wider uppercase text-slate-500 mb-1.5 ml-2">
                  {section.label}
                </div>
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activePage === item.id;
                    return (
                      <button
                        key={item.id}
                        id={`nav-item-${item.id}`}
                        onClick={() => {
                          setActivePage(item.id);
                          setMobileOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer",
                          isActive
                            ? "bg-emerald-600/20 text-white font-medium shadow-inner"
                            : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                        )}
                      >
                        <Icon size={18} className={isActive ? "text-emerald-400" : ""} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* User Profile & Logout footer */}
          <div className="mt-4 pt-4 border-t border-white/[0.08] space-y-3 shrink-0">
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 min-w-[2rem] rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                <User className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-xs font-semibold truncate">{user.name || "Zain Ali"}</div>
                <div className="text-emerald-400/80 text-[0.68rem] truncate mt-0.5">{user.email}</div>
              </div>
            </div>
            <button
              id="sidebar-logout-btn"
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-400/80 hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
            >
              {loggingOut ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
              <span>{loggingOut ? "Signing out..." : "Sign Out"}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="lg:ml-64 min-h-screen">
        <div className="p-4 pt-16 lg:p-8 lg:pt-8 max-w-[1400px] mx-auto">
          <PageComponent />
        </div>
      </main>
    </div>
  );
}
