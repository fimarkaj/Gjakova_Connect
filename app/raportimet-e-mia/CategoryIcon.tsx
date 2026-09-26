const PATHS: Record<string, string> = {
  administrata: '<path d="M3 21h18M4 10h16M12 3l9 7H3l9-7z"/><path d="M6 10v11M10 10v11M14 10v11M18 10v11"/>',
  shendetesi: '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.8-8 11-8 11z"/><path d="M12 9v5M9.5 11.5h5"/>',
  arsim: '<path d="M2 9l10-5 10 5-10 5-10-5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',
  buxhet: '<circle cx="12" cy="12" r="9"/><path d="M15 9h-4a2 2 0 000 4h2a2 2 0 010 4H9M12 6v2M12 17v1"/>',
  zhvillim_ekonomik: '<path d="M3 20h18"/><path d="M4 16l5-5 4 4 7-7"/><path d="M15 8h5v5"/>',
  urbanizem: '<path d="M3 21h18M5 21V8l6-4v17M11 21V10h8v11"/><path d="M14 13h2M14 17h2M7.5 11h1M7.5 15h1"/>',
  bujqesi: '<path d="M12 21V9"/><path d="M12 13c-4 0-6-3-6-6 3 0 6 2 6 6zM12 11c0-4 3-6 6-6 0 3-2 6-6 6z"/><path d="M5 21h14"/>',
  sherbime_publike: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  infrastruktura: '<path d="M4 20L9 4h6l5 16"/><path d="M12 4v16" stroke-dasharray="2 2"/>',
  kulture: '<path d="M4 20h16M5 20V10M9.5 20V10M14.5 20V10M19 20V10M3 10l9-6 9 6H3z"/>',
  mbrojtje_shpetim: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M12 8v5M12 16v.01"/>',
  kadastri: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z"/><path d="M9 3v15M15 6v15"/>',
  inspektorati: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/><path d="M8.5 11l2 2 3.5-3.5"/>',
  tjeter: '<circle cx="12" cy="12" r="2"/><circle cx="5" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
};

export default function CategoryIcon({ id, className }: { id: string | null; className?: string }) {
  const path = (id && PATHS[id]) || PATHS.tjeter;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      dangerouslySetInnerHTML={{ __html: path }}
    />
  );
}
