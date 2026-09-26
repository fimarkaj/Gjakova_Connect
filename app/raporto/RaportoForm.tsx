"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { addMyTicket } from "@/lib/my-tickets";
import Toast from "@/components/Toast";

const PinMap = dynamic(() => import("./PinMap"), {
  ssr: false,
  loading: () => <div className="pin-map-hint">Duke ngarkuar hartën…</div>,
});

type LatLng = { lat: number; lng: number };

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h3l1.5-2.5h7L17 7h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z" />
      <circle cx="12" cy="13" r="3.6" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16.5V19a2 2 0 002 2h12a2 2 0 002-2v-2.5" />
      <path d="M7 9l5-5 5 5" />
      <path d="M12 4v13" />
    </svg>
  );
}

export default function RaportoForm() {
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoSource, setPhotoSource] = useState<"camera" | "upload" | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [pin, setPin] = useState<LatLng | null>(null);
  const [flyTo, setFlyTo] = useState<(LatLng & { nonce: number }) | null>(null);
  const [geoStatus, setGeoStatus] = useState("");

  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "" });
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function showToast(message: string) {
    setToast({ show: true, message });
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 3200);
  }

  function handleFile(file: File, source: "camera" | "upload") {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setPhotoFile(file);
      setPhotoPreview(e.target?.result as string);
      setPhotoSource(source);
    };
    reader.readAsDataURL(file);
  }

  function resetPhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoSource(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleMapSelect(pos: LatLng) {
    setPin(pos);
    setGeoStatus("Pika u shënua manualisht në hartë.");
  }

  function handleGeoClick() {
    if (!navigator.geolocation) {
      setGeoStatus("GPS nuk mbështetet në këtë shfletues.");
      return;
    }
    setGeoStatus("Duke gjetur vendndodhjen…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPin(next);
        setFlyTo({ ...next, nonce: Date.now() });
        setGeoStatus(
          `Vendndodhja u gjet dhe u shënua në hartë (${next.lat.toFixed(3)}, ${next.lng.toFixed(3)}).`
        );
      },
      () => {
        setGeoStatus("Nuk u lejua qasja te vendndodhja — shëno pikën manualisht në hartë.");
      },
      { timeout: 6000 }
    );
  }

  const canSubmit = Boolean(
    photoFile && pin && description.trim().length > 2 && !submitting
  );

  async function handleSubmit() {
    if (!canSubmit || !photoFile || !pin) return;
    setSubmitting(true);
    try {
      const photoForm = new FormData();
      photoForm.append("photo", photoFile);
      const photoRes = await fetch("/api/reports/photo", {
        method: "POST",
        body: photoForm,
      });
      const photoData = await photoRes.json();
      if (!photoRes.ok) throw new Error(photoData?.error || "photo upload failed");

      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          latitude: pin.lat,
          longitude: pin.lng,
          photoUrl: photoData.photoUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "submit failed");

      addMyTicket(data.report.ticket_code);
      showToast("Raportimi u dërgua — statusi tani është “Pranuar”.");
      setConfirmation(data.report.ticket_code);

      resetPhoto();
      setDescription("");
      setPin(null);
      setFlyTo(null);
      setGeoStatus("");
    } catch (err) {
      console.error(err);
      showToast("Diçka shkoi keq — provo përsëri.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="report" id="raporto">
      <div className="wrap">
        <div className="section-head">
          <h2>Raporto një problem</h2>
          <p>
            Sa më shumë detaje, aq më shpejt reagon ekipi përkatës. Foto dhe vendndodhja janë
            të detyrueshme.
          </p>
        </div>

        {confirmation && (
          <div className="auto-cat-note" style={{ marginBottom: 22, background: "var(--olive-bg)" }}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--olive)" }}>
              <path d="M9 12l2 2 4-4" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            <span>
              Raportimi u regjistrua me kodin <strong>{confirmation}</strong>. Ruaje këtë kod
              për ta ndjekur statusin më vonë.
            </span>
          </div>
        )}

        <div className="report-grid">
          <div>
            <div
              id="cameraZone"
              className={`camera-zone${photoSource === "camera" && photoPreview ? " has-preview" : ""}`}
              style={photoSource === "upload" && photoPreview ? { display: "none" } : undefined}
              onClick={() => {
                if (!(photoSource === "camera" && photoPreview)) cameraInputRef.current?.click();
              }}
            >
              {photoSource === "camera" && photoPreview ? (
                <div className="preview-wrap">
                  <img src={photoPreview} alt="Pamje e fotos" />
                  <button
                    type="button"
                    className="preview-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      resetPhoto();
                    }}
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <>
                  <CameraIcon />
                  <strong>Bëj një foto</strong>
                  <small>Hap kamerën e telefonit dhe fotografo problemin direkt</small>
                </>
              )}
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files?.[0]) handleFile(e.target.files[0], "camera");
              }}
            />

            <div
              className={`dropzone dropzone-secondary${dragOver ? " drag" : ""}${
                photoSource === "upload" && photoPreview ? " has-preview" : ""
              }`}
              style={photoSource === "camera" && photoPreview ? { display: "none" } : undefined}
              onClick={() => {
                if (!(photoSource === "upload" && photoPreview)) fileInputRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0], "upload");
              }}
            >
              {photoSource === "upload" && photoPreview ? (
                <div className="preview-wrap">
                  <img src={photoPreview} alt="Pamje e fotos" />
                  <button
                    type="button"
                    className="preview-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      resetPhoto();
                    }}
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <>
                  <UploadIcon />
                  <span className="dz-text">Ose ngarko një foto ekzistuese</span>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files?.[0]) handleFile(e.target.files[0], "upload");
              }}
            />
          </div>

          <div>
            <div className="field auto-cat-note">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" />
              </svg>
              <span>
                AI do ta kategorizojë automatikisht raportimin bazuar në përshkrimin tënd.
              </span>
            </div>

            <div className="field">
              <label>
                Vendndodhja <span className="hint">kliko në hartë për të shënuar pikën</span>
              </label>
              <div className="pin-map">
                <PinMap position={pin} onSelect={handleMapSelect} flyTo={flyTo} />
                {!pin && (
                  <div className="pin-map-hint">Kliko / prek hartën për të shënuar problemin</div>
                )}
              </div>
              <div className="loc-row">
                <button type="button" className="btn-geo btn-geo-full" onClick={handleGeoClick}>
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                  </svg>
                  Gjej mua
                </button>
              </div>
              <div className="geo-status">{geoStatus}</div>
            </div>

            <div className="field">
              <label>
                Përshkrimi <span className="hint">e detyrueshme</span>
              </label>
              <textarea
                rows={3}
                placeholder="Përshkruaj shkurt problemin — p.sh. gropë e madhe në mes të rrugës"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <button className="btn-submit" disabled={!canSubmit} onClick={handleSubmit}>
              {submitting ? "Duke dërguar…" : "Dërgo raportin"}
            </button>
            <div className="form-note">
              Duke dërguar, raportimi shfaqet publikisht te &quot;Raportet e fundit&quot; pa
              emrin tënd. Komuna e Gjakovës e përditëson statusin kur ekipi e shqyrton.
            </div>
          </div>
        </div>
      </div>

      <Toast message={toast.message} show={toast.show} />
    </section>
  );
}
