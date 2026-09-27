import type { Metadata } from "next";
import RaportoForm from "./RaportoForm";

export const metadata: Metadata = {
  title: "Submit a report — Gjakova Connect",
};

export default function RaportoPage() {
  return <RaportoForm />;
}
