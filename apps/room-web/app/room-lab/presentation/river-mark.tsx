/**
 * The product mark: two offset sine strokes, a stream seen from above. Sits
 * before the wordmark on the rail, the create page and the agent desk.
 */
export function RiverMark({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`shrink-0 text-primary ${className}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9c3-3 6-3 9 0s6 3 9 0" />
      <path d="M3 15c3-3 6-3 9 0s6 3 9 0" />
    </svg>
  );
}
