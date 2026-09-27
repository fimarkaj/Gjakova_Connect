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
      if (!res.ok) throw new Error(body.error || "Something went wrong.");
      setDepartments(body.departments as Department[]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Departments failed to load.");
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
        setSaveError(body.error || "Something went wrong.");
        return;
      }
      setDepartments((prev) =>
        prev ? prev.map((d) => (d.id === dept.id ? (body.department as Department) : d)) : prev
      );
      setEditingId(null);
    } catch {
      setSaveError("Something went wrong — please try again.");
    } finally {
      setSaveBusy(false);
    }
  }

  async function addDepartment() {
    if (!addName.trim()) {
      setAddError("Department name is missing.");
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
        setAddError(body.error || "Something went wrong.");
        return;
      }
      setDepartments((prev) => (prev ? [...prev, body.department as Department] : [body.department as Department]));
      setAddName("");
      setAddCategory("");
      setAddEmail("");
      setAddOpen(false);
    } catch {
      setAddError("Something went wrong — please try again.");
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <section>
      <div className="wrap">
        <div className="section-head">
          <h2>Departments</h2>
          <p>
            Contact emails for each department — used when staff choose &quot;Send to department&quot;
            on a report.
          </p>
        </div>

        <AdminNav />

        <div className="admin-toolbar admin-toolbar-end">
          <button type="button" className="btn-geo admin-refresh" onClick={load} disabled={loading}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 11a8 8 0 10-2.3 5.7" />
              <path d="M20 4v7h-7" />
            </svg>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {loadError && <InlineError message={loadError} onRetry={load} />}

        {loading && !departments ? (
          <TableSkeleton rows={6} cols={4} />
        ) : !departments ? null : departments.length === 0 ? (
          <div className="empty-state">
            <p>No departments yet.</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table dept-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Contact email</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.id}>
                    <td data-label="Name">{d.name}</td>
                    <td data-label="Category">{categoryName(d.category)}</td>
                    <td data-label="Contact email">
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
                            {saveBusy ? "Saving…" : "Save"}
                          </button>
                          <button type="button" className="btn-ghost" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button type="button" className="link-button" onClick={() => startEdit(d)}>
                          {d.contact_email || <span className="admin-muted">Set email</span>}
                        </button>
                      )}
                      {editingId === d.id && saveError && (
                        <div className="confirm-resolved-error detail-error">{saveError}</div>
                      )}
                    </td>
                    <td className="admin-date" data-label="Updated" title={formatDate(d.updated_at, true)}>
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
                  <span>Name</span>
                  <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)} />
                </label>
                <label className="admin-control">
                  <span>Category</span>
                  <select
                    className="admin-select"
                    value={addCategory}
                    onChange={(e) => setAddCategory(e.target.value)}
                  >
                    <option value="">No category</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-control">
                  <span>Contact email</span>
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
                  {addBusy ? "Adding…" : "Add department"}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setAddOpen(false)}>
                  Cancel
                </button>
              </div>
              {addError && <div className="confirm-resolved-error detail-error">{addError}</div>}
            </div>
          ) : (
            <button type="button" className="btn-ghost" onClick={() => setAddOpen(true)}>
              + Add new department
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
