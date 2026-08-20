"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Location } from "@/types";

// Project-wide default: Shop (id=2). Kept in sync with
// src/lib/data/locations.ts → DEFAULT_LOCATION_ID.
const DEFAULT_LOCATION_ID = 2;

interface LocationSelectProps {
  value: number | null;
  onChange: (locationId: number) => void;
  className?: string;
  /** Show an "All Locations" option (value = 0) — useful for list filters */
  showAllOption?: boolean;
  /** Disable the select */
  disabled?: boolean;
}

/**
 * Reusable location selector (Shop / Farmhouse).
 * Fetches locations from /api/locations on mount.
 *
 * Usage:
 *   <LocationSelect value={locId} onChange={setLocId} />
 *   <LocationSelect value={locId} onChange={setLocId} showAllOption />
 */
const DEFAULT_LOCATIONS: Location[] = [
  { id: 2, name: "Shop", created_at: "2026-01-01" },
  { id: 1, name: "Farm", created_at: "2026-01-01" },
];

export function LocationSelect({
  value,
  onChange,
  className,
  showAllOption = false,
  disabled = false,
}: LocationSelectProps) {
  const [locations, setLocations] = React.useState<Location[]>(DEFAULT_LOCATIONS);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/locations", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load locations");
        const data = await res.json();
        if (mounted && Array.isArray(data.locations) && data.locations.length > 0) {
          setLocations(data.locations);
          if (!value) {
            const shop = data.locations.find((l: Location) => l.id === DEFAULT_LOCATION_ID);
            onChange(shop ? shop.id : data.locations[0].id);
          }
        }
      } catch (err) {
        console.error("LocationSelect: failed to load locations", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const effectiveValue = value !== undefined && value !== null ? String(value) : "2";

  return (
    <Select
      value={effectiveValue}
      onValueChange={(v) => onChange(Number(v))}
      disabled={disabled}
    >
      <SelectTrigger className={className} size="sm">
        <SelectValue placeholder="Select location" />
      </SelectTrigger>
      <SelectContent>
        {showAllOption && <SelectItem value="0">All Locations</SelectItem>}
        {locations.map((loc) => (
          <SelectItem key={loc.id} value={String(loc.id)}>
            {loc.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
