import type { Metadata } from "next";
import RaportoForm from "./RaportoForm";

export const metadata: Metadata = {
  title: "Raporto një problem — Raporto Gjakovën",
};

export default function RaportoPage() {
  return <RaportoForm />;
}
