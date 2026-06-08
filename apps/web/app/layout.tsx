import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agent Task Loop — drive AI coding agents end to end',
  description:
    'A local CLI and TUI that drives AI coding agents through task execution, review, rework, and pull-request handoff. Reads your existing trackers, multi-agent ready.',
  metadataBase: new URL('https://agent-task-loop.vercel.app'),
  openGraph: {
    title: 'Agent Task Loop',
    description:
      'Drive AI coding agents through task execution, review, rework, and PR handoff — from your terminal.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Agent Task Loop',
    description: 'Drive AI coding agents through execution, review, rework, and PR handoff.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
