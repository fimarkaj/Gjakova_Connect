"use client";

import { useCallback, useEffect, useState } from "react";
import { CATEGORIES } from "@/lib/types";
import type { Department } from "@/lib/types";
import { formatDate } from "@/lib/time";
import AdminNav from "../AdminNav";
import { InlineError, TableSkeleton } from "../AdminStates";

function categoryName(id: string | null): string {
  if (!id) return "—";
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export default function DepartmentsClient() {
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addCategory, setAddCategory] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/departments");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Diçka shkoi keq.");
      setDepartments(body.departments as Department[]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Departamentet nuk u ngarkuan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(dept: Department) {
    setEditingId(dept.id);
    setEditEmail(dept.contact_email ?? "");
    setSaveError(null);
  }

  async function saveEmail(dept: Department) {
    setSaveBusy(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/admin/departments/${dept.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_email: editEmail.trim() || null }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSaveError(body.error || "Diçka shkoi keq.");
        return;
      }
      setDepartments((prev) =>
        prev ? prev.map((d) => (d.id === dept.id ? (body.department as Department) : d)) : prev
      );
      setEditingId(null);
    } catch {
      setSaveError("Diçka shkoi keq — provo përsëri.");
    } finally {
      setSaveBusy(false);
    }
  }

  async function addDepartment() {
    if (!addName.trim()) {
      setAddError("Emri i departamentit mungon.");
      return;
    }
    setAddBusy(true);
    setAddError(null);
    try {
      const res = await fetch("/api/admin/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName.trim(),
          category: addCategory || null,
          contact_email: addEmail.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setAddError(body.error || "Diçka shkoi keq.");
        return;
      }
      setDepartments((prev) => (prev ? [...prev, body.department as Department] : [body.department as Department]));
      setAddName("");
      setAddCategory("");
      setAddEmail("");
      setAddOpen(false);
    } catch {
      setAddError("Diçka shkoi keq — provo përsëri.");
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <section>
      <div className="wrap">
        <div className="section-head">
          <h2>Departamentet</h2>
          <p>
            Emailat e kontaktit për çdo departament — përdoren kur stafi zgjedh &quot;Dërgo te departamenti&quot;
            te një raportim.
          </p>
        </div>

        <AdminNav />

        <div className="admin-toolbar admin-toolbar-end">
          <button type="button" className="btn-geo admin-refresh" onClick={load} disabled={loading}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 11a8 8 0 10-2.3 5.7" />
              <path d="M20 4v7h-7" />
            </svg>
            {loading ? "Duke rifreskuar…" : "Rifresko"}
          </button>
        </div>

        {loadError && <InlineError message={loadError} onRetry={load} />}

        {loading && !departments ? (
          <TableSkeleton rows={6} cols={4} />
        ) : !departments ? null : departments.length === 0 ? (
          <div className="empty-state">
            <p>Ende nuk ka asnjë departament.</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table dept-table">
              <thead>
                <tr>
                  <th>Emri</th>
                  <th>Kategoria</th>
                  <th>Email kontakti</th>
                  <th>Përditësuar</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.id}>
                    <td data-label="Emri">{d.name}</td>
                    <td data-label="Kategoria">{categoryName(d.category)}</td>
                    <td data-label="Email kontakti">
                      {editingId === d.id ? (
                        <div className="loc-row">
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            placeholder="email@gjakova.org"
                            autoFocus
                          />
                          <button type="button" className="btn-geo" disabled={saveBusy} onClick={() => saveEmail(d)}>
                            {saveBusy ? "Duke ruajtur…" : "Ruaj"}
                          </button>
                          <button type="button" className="btn-ghost" onClick={() => setEditingId(null)}>
                            Anulo
                          </button>
                        </div>
                      ) : (
                        <button type="button" className="link-button" onClick={() => startEdit(d)}>
                          {d.contact_email || <span className="admin-muted">Vendos email</span>}
                        </button>
                      )}
                      {editingId === d.id && saveError && (
                        <div className="confirm-resolved-error detail-error">{saveError}</div>
                      )}
                    </td>
                    <td className="admin-date" data-label="Përditësuar" title={formatDate(d.updated_at, true)}>
                      {formatDate(d.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="dept-add">
          {addOpen ? (
            <div className="dept-add-form">
              <div className="admin-toolbar">
                <label className="admin-control">
                  <span>Emri</span>
                  <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)} />
                </label>
                <label className="admin-control">
                  <span>Kategoria</span>
                  <select
                    className="admin-select"
                    value={addCategory}
                    onChange={(e) => setAddCategory(e.target.value)}
                  >
                    <option value="">Pa kategori</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-control">
                  <span>Email kontakti</span>
                  <input
                    type="email"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    placeholder="email@gjakova.org"
                  />
                </label>
              </div>
              <div className="loc-row">
                <button type="button" className="btn-geo" disabled={addBusy} onClick={addDepartment}>
                  {addBusy ? "Duke shtuar…" : "Shto departamentin"}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setAddOpen(false)}>
                  Anulo
                </button>
              </div>
              {addError && <div className="confirm-resolved-error detail-error">{addError}</div>}
            </div>
          ) : (
            <button type="button" className="btn-ghost" onClick={() => setAddOpen(true)}>
              + Shto departament të ri
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
