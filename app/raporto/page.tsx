import type { Metadata } from "next";
import RaportoForm from "./RaportoForm";

export const metadata: Metadata = {
  title: "Raporto një problem — Gjakova Connect",
};

export default function RaportoPage() {
  return <RaportoForm />;
}
