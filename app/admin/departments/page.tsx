import type { Metadata } from "next";
import DepartmentsClient from "./DepartmentsClient";

export const metadata: Metadata = {
  title: "Departamentet — Gjakova Connect",
  robots: { index: false },
};

export default function DepartmentsPage() {
  return <DepartmentsClient />;
}
