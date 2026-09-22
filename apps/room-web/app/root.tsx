import type { LinksFunction, MetaFunction } from 'react-router';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import globalStyles from './styles/global.css?url';
import { copy } from './room-lab/copy';

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: globalStyles },
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
];

export const meta: MetaFunction = () => [
  { title: `${copy.label.product} ${copy.label.rooms}` },
  {
    name: 'description',
    content: copy.say.metaDescription,
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    // The theme script below stamps `dark` on this element before hydration, so
    // the client tree legitimately carries a class the server HTML does not.
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        {/* Stamp the resolved theme on <html> before first paint. shadcn keys the
            dark palette off a `dark` class, so 跟随系统 has to resolve the media
            query here rather than leave it to CSS. It runs before hydration, so
            <html> carries the class React never rendered — hence the
            suppressHydrationWarning above. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var t=localStorage.getItem('rivus-theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}",
          }}
        />
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
