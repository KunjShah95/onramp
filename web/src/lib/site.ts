/** Public site origin used in canonical URLs, Open Graph tags and JSON-LD.
 *  Set VITE_APP_URL per environment; the fallback is the live deployment. */
export const SITE_URL =
  (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/+$/, '') ||
  'https://developer-onboard.vercel.app'
