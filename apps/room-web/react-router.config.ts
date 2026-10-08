import type { Config } from '@react-router/dev/config';

const publicOrigin = process.env.ROOM_PUBLIC_ORIGIN;

export default {
  ssr: true,
  // The loopback HTTP server sits behind the proxy's HTTPS entry. The route
  // guard additionally checks the complete origin, including its protocol.
  allowedActionOrigins: publicOrigin ? [new URL(publicOrigin).host] : [],
} satisfies Config;
