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
            Raporto Gjakovën
          </span>
          <div className="brand-sub" style={{ marginTop: 4, marginBottom: 14 }}>
            Komuna e Gjakovës
          </div>
          <p>
            Platformë qytetare për raportimin e problemeve në infrastrukturën publike të qytetit — një prototip i
            zhvilluar për hackathon.
          </p>
        </div>
        <div>
          <h4>KOMUNA</h4>
          <ul>
            <li><Link href="/">Rreth komunës</Link></li>
            <li><Link href="/">Departamentet</Link></li>
            <li><Link href="/">Kontakt</Link></li>
          </ul>
        </div>
        <div>
          <h4>PLATFORMA</h4>
          <ul>
            <li><Link href="/raporto">Raporto problem</Link></li>
            <li><Link href="/raportimet-e-mia">Shiko raportimet</Link></li>
            <li><Link href="/#si-funksionon">Si funksionon</Link></li>
          </ul>
        </div>
      </div>
      <div className="wrap footer-bottom">
        <span>Prototip hackathon — jo shërbim zyrtar aktiv i Komunës së Gjakovës.</span>
        <span>Gjakovë, Kosovë</span>
      </div>
    </footer>
  );
}
