import Link from "next/link";

export default function Footer() {
  return (
    <footer>
      <div className="wrap footer-grid">
        <div>
          <span
            className="brand-name"
            style={{ fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontSize: 19, fontWeight: 600 }}
          >
            Gjakova Connect
          </span>
          <div className="brand-sub" style={{ marginTop: 4, marginBottom: 14 }}>
            Municipality of Gjakova
          </div>
          <p>
            A citizen platform for reporting problems in the city&apos;s public infrastructure — a prototype
            developed for a hackathon.
          </p>
        </div>
        <div>
          <h4>MUNICIPALITY</h4>
          <ul>
            <li>
              <a href="https://gjakova.rks-gov.net/" target="_blank" rel="noopener noreferrer">
                About the municipality
              </a>
            </li>
            <li><Link href="/">Departments</Link></li>
            <li><Link href="/">Contact</Link></li>
          </ul>
        </div>
        <div>
          <h4>PLATFORM</h4>
          <ul>
            <li><Link href="/raporto">Submit a report</Link></li>
            <li><Link href="/raportimet-e-mia">See reports</Link></li>
            <li><Link href="/#si-funksionon">How it works</Link></li>
          </ul>
        </div>
      </div>
      <div className="wrap footer-bottom">
        <span>Hackathon prototype — not an active official service of the Municipality of Gjakova.</span>
        <span>Gjakova, Kosovo</span>
      </div>
    </footer>
  );
}
