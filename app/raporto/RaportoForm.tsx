"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { addMyTicket } from "@/lib/my-tickets";
import Toast from "@/components/Toast";

const PinMap = dynamic(() => import("./PinMap"), {
  ssr: false,
  loading: () => <div className="pin-map-hint">Loading map…</div>,
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

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.2l2.4 2.4 4.6-4.8" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 5.5A1.5 1.5 0 0013.5 4H6a2 2 0 00-2 2v7.5A1.5 1.5 0 005.5 15" />
    </svg>
  );
}

function CopiedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
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
  const [notifyEmail, setNotifyEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "" });
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  function resetForm() {
    resetPhoto();
    setDescription("");
    setNotifyEmail("");
    setPin(null);
    setFlyTo(null);
    setGeoStatus("");
  }

  async function copyTicketCode() {
    if (!confirmation) return;
    try {
      await navigator.clipboard.writeText(confirmation);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      // Clipboard blocked (insecure context, denied permission) — the code
      // stays on screen, so the citizen can still write it down.
      showToast("Copy was not allowed — save the code manually.");
    }
  }

  function startNewReport() {
    resetForm();
    setConfirmation(null);
    setCopied(false);
  }

  function handleMapSelect(pos: LatLng) {
    setPin(pos);
    setGeoStatus("Point marked manually on the map.");
  }

  function handleGeoClick() {
    if (!navigator.geolocation) {
      setGeoStatus("GPS is not supported in this browser.");
      return;
    }
    setGeoStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPin(next);
        setFlyTo({ ...next, nonce: Date.now() });
        setGeoStatus(
          `Location found and marked on the map (${next.lat.toFixed(3)}, ${next.lng.toFixed(3)}).`
        );
      },
      () => {
        setGeoStatus("Location access was not allowed — mark the point manually on the map.");
      },
      { timeout: 6000 }
    );
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailTrimmed = notifyEmail.trim();
  const emailValid = emailTrimmed.length === 0 || EMAIL_RE.test(emailTrimmed);

  const canSubmit = Boolean(
    photoFile && pin && description.trim().length > 2 && emailValid && !submitting
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
          notifyEmail: emailTrimmed || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "submit failed");

      addMyTicket(data.report.ticket_code);
      showToast("Report submitted — status is now “Submitted”.");
      setCopied(false);
      setConfirmation(data.report.ticket_code);
      resetForm();
    } catch (err) {
      console.error(err);
      showToast("Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    return (
      <section className="report" id="raporto">
        <div className="wrap">
          <div className="confirm-card">
            <div className="confirm-icon" aria-hidden="true">
              <CheckCircleIcon />
            </div>
            <h2 className="confirm-title">Report submitted</h2>
            <p className="confirm-label">Ticket number</p>
            <button
              type="button"
              className="confirm-code"
              onClick={copyTicketCode}
              aria-label={`Copy ticket number ${confirmation}`}
            >
              <span className="confirm-code-value">{confirmation}</span>
              <span className="confirm-code-copy">
                {copied ? <CopiedIcon /> : <CopyIcon />}
                {copied ? "Copied" : "Copy code"}
              </span>
            </button>
            <p className="confirm-note">
              Save this code — you can use it to track the status of your report at any time.
            </p>
            <div className="confirm-actions">
              <Link
                className="btn-submit"
                href={`/raportimet-e-mia?ticket=${encodeURIComponent(confirmation)}`}
              >
                Track report
              </Link>
              <button type="button" className="btn-ghost" onClick={startNewReport}>
                Submit another report
              </button>
            </div>
            <Link className="confirm-home" href="/">
              Back to home
            </Link>
          </div>
        </div>

        <Toast message={toast.message} show={toast.show} />
      </section>
    );
  }

  return (
    <section className="report" id="raporto">
      <div className="wrap">
        <div className="section-head">
          <h2>Submit a report</h2>
          <p>
            The more detail, the faster the relevant team can respond. Photo and location are
            required.
          </p>
        </div>

        <div className="report-grid">
          <div className="report-photo">
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
                  <img src={photoPreview} alt="Photo preview" />
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
                  <strong>Take a photo</strong>
                  <small>Open your phone&apos;s camera and photograph the problem directly</small>
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
                  <img src={photoPreview} alt="Photo preview" />
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
                  <span className="dz-text">Or upload an existing photo</span>
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

          <div className="report-details">
            <div className="field">
              <label>
                Location <span className="hint">click on the map to mark the point</span>
              </label>
              <div className="pin-map">
                <PinMap position={pin} onSelect={handleMapSelect} flyTo={flyTo} />
                {!pin && (
                  <div className="pin-map-hint">Click / tap the map to mark the problem</div>
                )}
              </div>
              <div className="loc-row">
                <button type="button" className="btn-geo btn-geo-full" onClick={handleGeoClick}>
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                  </svg>
                  Find me
                </button>
              </div>
              <div className="geo-status">{geoStatus}</div>
            </div>

            <div className="field auto-cat-note">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" />
              </svg>
              <span>
                AI will automatically categorize the report based on your description.
              </span>
            </div>

            <div className="field">
              <label>
                Description <span className="hint">required</span>
              </label>
              <textarea
                rows={3}
                placeholder="Briefly describe the problem — e.g. a large pothole in the middle of the road"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="field">
              <label>
                Email <span className="hint">optional — to be notified when the status changes</span>
              </label>
              <input
                type="email"
                placeholder="name@example.com"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
              />
              {!emailValid && <div className="geo-status">The email format doesn&apos;t look right.</div>}
            </div>

            <button className="btn-submit" disabled={!canSubmit} onClick={handleSubmit}>
              {submitting ? "Sending…" : "Send report"}
            </button>
            <div className="form-note">
              Once submitted, the report appears publicly under &quot;Recent reports&quot; without
              your name. The Municipality of Gjakova updates the status as the team reviews it.
            </div>
          </div>
        </div>
      </div>

      <Toast message={toast.message} show={toast.show} />
    </section>
  );
}
