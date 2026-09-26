import type { Metadata } from "next";
import AdminClient from "./AdminClient";

export const metadata: Metadata = {
  title: "Paneli i stafit — Raporto Gjakovën",
  robots: { index: false },
};

export default function AdminPage() {
  return <AdminClient />;
}
