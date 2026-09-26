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
            <img src="/hero-clock-tower.webp" alt="" />
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
