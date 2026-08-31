import type { LinksFunction, MetaFunction } from '@remix-run/node';
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from '@remix-run/react';
import globalStyles from './styles/global.css?url';

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: globalStyles },
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
];

export const meta: MetaFunction = () => [
  { title: 'Rivus Room — Compose local agents into one shared workspace' },
  {
    name: 'description',
    content: 'Compose local coding agents, chat in one ordered Room, verify them with count-off, and add an independent Task review gate.',
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
