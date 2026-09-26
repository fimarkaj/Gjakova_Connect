"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <div className="filter-row admin-nav">
      <Link href="/admin" className={`filter-chip${pathname === "/admin" ? " selected" : ""}`}>
        Raportimet
      </Link>
      <Link
        href="/admin/silence-map"
        className={`filter-chip${pathname === "/admin/silence-map" ? " selected" : ""}`}
      >
        Harta e heshtjes
      </Link>
      <Link
        href="/admin/chronic-issues"
        className={`filter-chip${pathname === "/admin/chronic-issues" ? " selected" : ""}`}
      >
        Çështje kronike
      </Link>
    </div>
  );
}
