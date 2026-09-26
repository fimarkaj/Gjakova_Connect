import Link from "next/link";

export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <div className="eyebrow-free">Për qytetarët e Gjakovës</div>
            <h1>
              Sheh një problem
              <br />
              në qytet? Na e trego.
            </h1>
            <p className="lede">
              Bëj një foto, shëno vendin, dhe raportimi shkon direkt te komuna. Ne e ndjekim
              statusin bashkë me ty — nga &quot;pranuar&quot; te &quot;zgjidhur&quot;.
            </p>
            <div className="hero-actions">
              <Link href="/raporto" className="btn-primary">
                Raporto një problem
              </Link>
              <Link href="/raportimet-e-mia" className="btn-ghost">
                Shiko raportimet e fundit
              </Link>
            </div>
            <div className="stats-strip">
              <div className="stat">
                <b>128</b>
                <span>raportime gjithsej</span>
              </div>
              <div className="stat">
                <b>61%</b>
                <span>të zgjidhura</span>
              </div>
              <div className="stat">
                <b>19</b>
                <span>në proces tani</span>
              </div>
            </div>
            <div className="stats-note">*të dhëna shembull për prototipin</div>
          </div>

          <div className="hero-art" aria-hidden="true">
            <svg viewBox="0 0 480 360" fill="none">
              <rect x="0" y="240" width="480" height="120" fill="var(--stone-2)" />
              {/* clock tower */}
              <rect x="40" y="150" width="34" height="110" fill="var(--clay)" />
              <rect x="34" y="140" width="46" height="16" fill="var(--clay-dark)" />
              <circle cx="57" cy="120" r="18" fill="var(--paper)" stroke="var(--brass)" strokeWidth="3" />
              <line x1="57" y1="120" x2="57" y2="108" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
              <line x1="57" y1="120" x2="65" y2="120" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
              {/* bazaar roofs */}
              <polygon points="90,260 130,225 170,260" fill="var(--clay-light)" />
              <polygon points="165,260 205,220 245,260" fill="var(--clay)" />
              <rect x="95" y="258" width="70" height="42" fill="var(--stone-3)" />
              <rect x="170" y="258" width="70" height="42" fill="var(--stone-3)" />
              {/* mosque dome + minaret */}
              <rect x="330" y="260" width="18" height="90" fill="var(--clay-dark)" />
              <polygon points="330,260 339,236 348,260" fill="var(--brass)" />
              <circle cx="339" cy="230" r="4" fill="var(--brass)" />
              <ellipse cx="270" cy="252" rx="46" ry="30" fill="var(--clay)" />
              <rect x="234" y="252" width="72" height="48" fill="var(--stone-3)" />
              <circle cx="270" cy="216" r="5" fill="var(--brass)" />
              {/* river line */}
              <path d="M0 300 Q 120 280 240 300 T 480 300" stroke="var(--brass)" strokeWidth="2" opacity="0.4" fill="none" />
              {/* stone street dots */}
              <g opacity="0.5">
                <circle cx="60" cy="335" r="2" fill="var(--stone-3)" />
                <circle cx="90" cy="330" r="2" fill="var(--stone-3)" />
                <circle cx="130" cy="336" r="2" fill="var(--stone-3)" />
                <circle cx="180" cy="329" r="2" fill="var(--stone-3)" />
                <circle cx="230" cy="335" r="2" fill="var(--stone-3)" />
                <circle cx="280" cy="330" r="2" fill="var(--stone-3)" />
                <circle cx="330" cy="337" r="2" fill="var(--stone-3)" />
                <circle cx="380" cy="330" r="2" fill="var(--stone-3)" />
                <circle cx="420" cy="335" r="2" fill="var(--stone-3)" />
              </g>
            </svg>
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* HOW IT WORKS */}
      <section id="si-funksionon">
        <div className="wrap">
          <div className="section-head">
            <h2>Si funksionon</h2>
            <p>Tri hapa, nga qytetari te ekipi i komunës.</p>
          </div>
          <div className="steps">
            <div className="step">
              <span className="step-num">1</span>
              <svg
                className="step-icon"
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="7" width="18" height="13" rx="2" />
                <path d="M8 7l1.5-3h5L16 7" />
                <circle cx="12" cy="13.5" r="3.2" />
              </svg>
              <h3>Fotografo problemin</h3>
              <p>
                Bëj një foto direkt nga telefoni — gropë në rrugë, dritë e prishur, mbeturina,
                apo çështje tjetër.
              </p>
            </div>
            <div className="step">
              <span className="step-num">2</span>
              <svg
                className="step-icon"
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <h3>Shëno vendndodhjen</h3>
              <p>
                Përdor GPS-në ose shkruaj rrugën. Kjo ndihmon ekipin ta gjejë problemin pa
                vonesë.
              </p>
            </div>
            <div className="step">
              <span className="step-num">3</span>
              <svg
                className="step-icon"
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 12l2 2 4-4" />
                <circle cx="12" cy="12" r="9" />
              </svg>
              <h3>Ndiq statusin</h3>
              <p>
                Raportimi kalon nga &quot;Pranuar&quot; në &quot;Në proces&quot; e më pas
                &quot;Zgjidhur&quot;, publikisht, për të gjithë.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
