'use client';

import { useState } from 'react';

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted transition hover:border-accent/50 hover:text-accent"
      aria-label={`Copy: ${text}`}
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}
