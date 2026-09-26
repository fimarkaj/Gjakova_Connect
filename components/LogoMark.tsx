export default function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src="/logo-mark.png"
      alt=""
      className={className}
      width={34}
      height={34}
      aria-hidden="true"
    />
  );
}
