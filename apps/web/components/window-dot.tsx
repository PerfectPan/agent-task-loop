/** One of the three traffic-light dots in a mock terminal window's title bar. */
export function WindowDot({ c }: { c: string }) {
  return <span className={`inline-block h-3 w-3 rounded-full ${c}`} />;
}
