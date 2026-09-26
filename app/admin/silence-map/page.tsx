import type { Metadata } from "next";
import SilenceMapClient from "./SilenceMapClient";

export const metadata: Metadata = {
  title: "Harta e heshtjes — Gjakova Connect",
  robots: { index: false },
};

export default function SilenceMapPage() {
  return <SilenceMapClient />;
}
