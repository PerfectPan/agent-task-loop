import type { TaskReviewVerdict } from './model';

/** A conservative review policy: only an exact first-line PASS is acceptance. */
export function parseTaskReviewVerdict(review: string): TaskReviewVerdict {
  return review.trim().split(/\r?\n/, 1)[0]?.trim() === 'VERDICT: PASS'
    ? 'PASS'
    : 'CHANGES_REQUESTED';
}
