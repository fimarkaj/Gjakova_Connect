"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import LogoMark from "@/components/LogoMark";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      setError("Email ose fjalëkalimi janë të gabuar.");
      return;
    }
    router.push("/raportimet-e-mia");
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <LogoMark className="login-mark" />
        <h1>Mirë se erdhe përsëri</h1>
        <p className="login-sub">Hyr për të ndjekur raportimet e tua dhe statusin e tyre.</p>

        {error && <div className="login-error">{error}</div>}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="loginEmail">Email</label>
            <input
              type="email"
              id="loginEmail"
              placeholder="emri@shembull.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="loginPassword">Fjalëkalimi</label>
            <input
              type="password"
              id="loginPassword"
              placeholder="••••••••"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-submit login-submit" disabled={submitting}>
            {submitting ? "Duke hyrë…" : "Hyr"}
          </button>
        </form>

        <p className="login-foot">
          Nuk ke llogari? <Link href="/signup">Krijo një</Link>
        </p>
      </div>
    </div>
  );
}
