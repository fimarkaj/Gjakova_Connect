"use client";

export default function Toast({ message, show }: { message: string; show: boolean }) {
  return (
    <div className={`toast${show ? " show" : ""}`}>
      <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
