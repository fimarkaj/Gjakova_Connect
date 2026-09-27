import type { Metadata } from "next";
import { Suspense } from "react";
import RaportimetClient from "./RaportimetClient";

export const metadata: Metadata = {
  title: "My Reports — Gjakova Connect",
};

export default function RaportimetEMiaPage() {
  return (
    <Suspense>
      <RaportimetClient />
    </Suspense>
  );
}
