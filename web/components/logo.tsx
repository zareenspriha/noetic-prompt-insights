/** Our own mark: a signal arc over a dot (prompt in, insight out). */
export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="pi-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7fd3ff" />
          <stop offset="1" stopColor="#3aa8e8" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="#06131d" stroke="url(#pi-g)" strokeOpacity=".5" />
      <path d="M8 18a8 8 0 0 1 16 0" fill="none" stroke="url(#pi-g)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M12 18a4 4 0 0 1 8 0" fill="none" stroke="url(#pi-g)" strokeWidth="2.6" strokeLinecap="round" opacity=".6" />
      <circle cx="16" cy="22.5" r="2" fill="#7fd3ff" />
    </svg>
  );
}
