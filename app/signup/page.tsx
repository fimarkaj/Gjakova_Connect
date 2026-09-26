"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import LogoMark from "@/components/LogoMark";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setSubmitting(false);
    if (error) {
      setError(error.message === "User already registered" ? "Ky email është regjistruar tashmë." : "Diçka shkoi keq — provo përsëri.");
      return;
    }
    if (data.session) {
      router.push("/raportimet-e-mia");
    } else {
      setDone(true);
    }
  }

  if (done) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <LogoMark className="login-mark" />
          <h1>Kontrollo emailin</h1>
          <p className="login-sub">
            Të dërguam një link konfirmimi te <strong>{email}</strong>. Konfirmoje llogarinë dhe pastaj hyr.
          </p>
          <p className="login-foot">
            <Link href="/login">Shko te faqja e hyrjes</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <LogoMark className="login-mark" />
        <h1>Krijo një llogari</h1>
        <p className="login-sub">Regjistrohu për të ndjekur raportimet e tua dhe statusin e tyre.</p>

        {error && <div className="login-error">{error}</div>}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="signupEmail">Email</label>
            <input
              type="email"
              id="signupEmail"
              placeholder="emri@shembull.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="signupPassword">Fjalëkalimi</label>
            <input
              type="password"
              id="signupPassword"
              placeholder="Të paktën 6 karaktere"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-submit login-submit" disabled={submitting}>
            {submitting ? "Duke krijuar…" : "Krijo llogarinë"}
          </button>
        </form>

        <p className="login-foot">
          Ke tashmë llogari? <Link href="/login">Hyr</Link>
        </p>
      </div>
    </div>
  );
}
