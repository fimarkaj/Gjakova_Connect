const PATHS: Record<string, string> = {
  rruge: '<path d="M4 20L9 4h6l5 16"/><path d="M12 4v16" stroke-dasharray="2 2"/>',
  drite:
    '<path d="M9 18h6M10 22h4"/><path d="M12 2a6 6 0 00-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5a3 3 0 011.1-2.2A6 6 0 0012 2z"/>',
  mbeturina: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  uji: '<path d="M12 3s6 6.5 6 11a6 6 0 11-12 0c0-4.5 6-11 6-11z"/>',
  gjelberim: '<path d="M4 20c8 0 14-6 14-14 0 0-13 0-14 12"/><path d="M4 20c0-4 3-8 7-9"/>',
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
