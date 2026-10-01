import { copy } from '../copy';
import { RiverMark } from './river-mark';

/** The mark plus the product's name, at the size every header uses. */
export function Wordmark({ taglineClassName = '' }: { taglineClassName?: string }) {
  return (
    <>
      <RiverMark size={18} />
      <strong className="text-sm font-semibold tracking-[-0.01em] leading-none">{copy.label.product}</strong>
      <span className={`text-xs leading-none text-muted-foreground ${taglineClassName}`}>{copy.label.tagline}</span>
    </>
  );
}
