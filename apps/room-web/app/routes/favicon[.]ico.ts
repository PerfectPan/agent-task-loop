import { redirect } from '@remix-run/node';

export const loader = () => redirect('/favicon.svg', 301);
