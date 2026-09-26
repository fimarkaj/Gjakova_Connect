import type { Metadata } from "next";
import { Suspense } from "react";
import RaportimetClient from "./RaportimetClient";

export const metadata: Metadata = {
  title: "Raportimet e Mia — Raporto Gjakovën",
};

export default function RaportimetEMiaPage() {
  return (
    <Suspense>
      <RaportimetClient />
    </Suspense>
  );
}
