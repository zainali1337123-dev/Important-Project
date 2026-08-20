"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { useState, useEffect } from "react";

export interface QuickNavItem {
  /** Section anchor id — must match the `id` attribute on the target element */
  id: string;
  /** Button label */
  label: string;
  /** Optional icon */
  icon?: LucideIcon;
  /** Optional accent color class (e.g. "text-emerald-600") */
  iconColor?: string;
}

/**
 * Sticky top navigation bar showing quick-jump buttons for the major sections
 * of the current page. Clicking a button smooth-scrolls to that section.
 *
 * Designed to sit directly under a PageHeader — its z-index keeps it visible
 * while scrolling the page body.
 */
export function QuickNav({ items, title }: { items: QuickNavItem[]; title?: string }) {
  const [activeId, setActiveId] = useState<string>("");

  // Track which section is currently in view to highlight active button
  useEffect(() => {
    if (!items.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActiveId(visible.target.id);
      },
      {
        rootMargin: "-20% 0px -60% 0px", // trigger when section reaches upper third
        threshold: [0, 0.25, 0.5, 1],
      },
    );
    items.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [items]);

  if (!items.length) return null;

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Smooth-scroll with offset for sticky header / nav
    const top = el.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top, behavior: "smooth" });
    setActiveId(id);
  };

  return (
    <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pb-3 pt-2 bg-[#F4F7F7]/95 backdrop-blur-sm border-b border-[#DCE5E5]">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-2">
        {title && (
          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#6B7C7F] shrink-0 pr-2 border-r border-[#DCE5E5] mr-1 w-full sm:w-auto sm:inline-block mb-1 sm:mb-0">
            {title}
          </span>
        )}
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleClick(item.id)}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border cursor-pointer",
                isActive
                  ? "bg-[#087F83] text-white border-[#087F83] shadow-sm"
                  : "bg-white text-[#173337] border-[#DCE5E5] hover:border-[#16A3A8] hover:text-[#087F83] hover:bg-[#E8F4F4]",
              )}
            >
              {Icon && <Icon className={cn("size-3.5", isActive ? "text-white" : item.iconColor || "text-[#087F83]")} />}
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
