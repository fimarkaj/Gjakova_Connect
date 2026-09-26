"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import LogoMark from "./LogoMark";
import { useAuth } from "./AuthProvider";
import { supabase } from "@/lib/supabase";

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, loading } = useAuth();

  async function handleLogout() {
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.push("/");
  }

  return (
    <header>
      <div className="nav">
        <Link href="/" className="brand">
          <LogoMark className="brand-mark" />
          <span>
            <span className="brand-name" style={{ display: "block" }}>
              Raporto Gjakovën
            </span>
            <span className="brand-sub">Komuna e Gjakovës</span>
          </span>
        </Link>

        <nav className={`links${menuOpen ? " nav-links-mobile-open" : ""}`}>
          <Link href="/" className={pathname === "/" ? "active" : ""} onClick={() => setMenuOpen(false)}>
            Ballina
          </Link>
          <Link href="/raporto" className={pathname === "/raporto" ? "active" : ""} onClick={() => setMenuOpen(false)}>
            Raporto
          </Link>
          <Link
            href="/raportimet-e-mia"
            className={pathname === "/raportimet-e-mia" ? "active" : ""}
            onClick={() => setMenuOpen(false)}
          >
            Raportimet e Mia
          </Link>
        </nav>

        {!loading && user ? (
          <button type="button" className="nav-cta" onClick={handleLogout}>
            Dil
          </button>
        ) : (
          <Link href="/login" className="nav-cta" onClick={() => setMenuOpen(false)}>
            Hyrje
          </Link>
        )}

        <button
          type="button"
          className="menu-toggle"
          aria-label="Hap menynë"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>
    </header>
  );
}
