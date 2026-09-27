import Link from "next/link";

export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <div className="eyebrow-free">For the citizens of Gjakova</div>
            <h1>
              See a problem
              <br />
              in the city? Tell us.
            </h1>
            <p className="lede">
              Take a photo, mark the spot, and the report goes straight to the municipality. We
              track the status together with you — from &quot;submitted&quot; to &quot;resolved&quot;.
            </p>
            <div className="hero-actions">
              <Link href="/raporto" className="btn-primary">
                Submit a report
              </Link>
              <Link href="/raportimet-e-mia" className="btn-ghost">
                See recent reports
              </Link>
            </div>
            <div className="stats-strip">
              <div className="stat">
                <b>128</b>
                <span>total reports</span>
              </div>
              <div className="stat">
                <b>61%</b>
                <span>resolved</span>
              </div>
              <div className="stat">
                <b>19</b>
                <span>in progress now</span>
              </div>
            </div>
            <div className="stats-note">*sample data for the prototype</div>
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
            <h2>How it works</h2>
            <p>Three steps, from the citizen to the municipality&apos;s team.</p>
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
              <h3>Photograph the problem</h3>
              <p>
                Take a photo directly from your phone — a pothole, a broken light, garbage,
                or another issue.
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
              <h3>Mark the location</h3>
              <p>
                Use GPS or write the street. This helps the team find the problem without
                delay.
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
              <h3>Track the status</h3>
              <p>
                The report moves from &quot;Submitted&quot; to &quot;In progress&quot; and then
                &quot;Resolved&quot;, publicly, for everyone.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
