export default function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <circle cx="17" cy="17" r="16" fill="var(--clay)" />
      <path d="M9 22 L9 14 L17 8 L25 14 L25 22 Z" fill="var(--stone)" />
      <circle cx="17" cy="12.5" r="1.6" fill="var(--clay)" />
      <rect x="14.5" y="17" width="5" height="5" fill="var(--clay)" />
    </svg>
  );
}
