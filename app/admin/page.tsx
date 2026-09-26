import type { Metadata } from "next";
import { Suspense } from "react";
import AdminClient from "./AdminClient";

export const metadata: Metadata = {
  title: "Paneli i stafit — Gjakova Connect",
  robots: { index: false },
};

export default function AdminPage() {
  return (
    <Suspense>
      <AdminClient />
    </Suspense>
  );
}
