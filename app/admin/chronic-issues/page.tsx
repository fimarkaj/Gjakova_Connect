import type { Metadata } from "next";
import ChronicIssuesClient from "./ChronicIssuesClient";

export const metadata: Metadata = {
  title: "Çështje kronike — Raporto Gjakovën",
  robots: { index: false },
};

export default function ChronicIssuesPage() {
  return <ChronicIssuesClient />;
}
