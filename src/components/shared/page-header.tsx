"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function PageHeader({ title, subtitle, description }: { title: string; subtitle?: string; description?: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-6 gap-2">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#173337] leading-tight">{title}</h1>
        {(subtitle || description) && <p className="text-sm text-[#6B7C7F] mt-1">{subtitle || description}</p>}
      </div>
    </div>
  );
}

export function MetricCard({
  label,
  title,
  value,
  color = "teal",
  prefix = "",
  suffix = "",
  icon: Icon,
  iconColor,
  words,
}: {
  label?: string;
  title?: string;
  value: string | number;
  color?: "teal" | "bright" | "deep" | "warning" | "expense" | "blue" | "purple" | "green" | "orange" | "amber" | string;
  prefix?: string;
  suffix?: string;
  icon?: LucideIcon;
  iconColor?: string;
  /** Optional: English counting words shown below the value */
  words?: string;
}) {
  const colorMap: Record<string, string> = {
    teal: "border-t-[#087F83] text-[#087F83]",
    bright: "border-t-[#16A3A8] text-[#16A3A8]",
    deep: "border-t-[#004B50] text-[#004B50]",
    warning: "border-t-[#C28A24] text-[#C28A24]",
    expense: "border-t-[#C28A24] text-[#C28A24]",
    amber: "border-t-[#C28A24] text-[#C28A24]",
    orange: "border-t-[#C28A24] text-[#C28A24]",
    blue: "border-t-[#087F83] text-[#087F83]",
    green: "border-t-[#087F83] text-[#087F83]",
    purple: "border-t-[#16A3A8] text-[#16A3A8]",
  };

  const colorClasses = colorMap[color] || `border-t-[#087F83] text-[#087F83]`;
  const textColor = colorClasses.split(" ")[1] || "text-[#087F83]";
  const borderColor = colorClasses.split(" ")[0] || "border-t-[#087F83]";
  const displayLabel = label || title || "";

  if (Icon) {
    return (
      <div className="bg-white rounded-2xl p-5 border border-[#DCE5E5] shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className={cn("text-xs font-bold uppercase tracking-wider text-[#6B7C7F]")}>
              {displayLabel}
            </div>
            <div className="text-2xl font-extrabold text-[#173337] mt-1">
              {prefix}{value}{suffix}
            </div>
            {words && <div className="text-[0.68rem] text-[#6B7C7F] mt-1 leading-tight capitalize">{words}</div>}
          </div>
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", iconColor || "bg-[#E8F4F4] text-[#087F83]")}>
            <Icon className={cn("w-5 h-5", iconColor ? "" : "text-[#087F83]")} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("bg-white rounded-2xl p-5 border border-[#DCE5E5] border-t-[3px] shadow-sm", borderColor)}>
      <div className={cn("text-xs font-bold uppercase tracking-wider", textColor)}>
        {displayLabel}
      </div>
      <div className={cn("text-2xl font-extrabold text-[#173337] mt-1")}>
        {prefix}{value}{suffix}
      </div>
      {words && <div className="text-[0.68rem] text-[#6B7C7F] mt-1 leading-tight capitalize">{words}</div>}
    </div>
  );
}