// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env: Record<string, string | undefined> = (import.meta as any).env || {};

export const ENDPOINTS = {
  /** AT Protocol relay (for sync endpoints like listReposByCollection) */
  RELAY_URL: env.VITE_RELAY_URL || 'https://relay1.us-east.bsky.network',

  /** Slingshot - AT Protocol record cache */
  SLINGSHOT_URL: env.VITE_SLINGSHOT_URL || 'https://slingshot.wisp.place',

  /** Bluesky public API */
  BLUESKY_API_URL: env.VITE_BLUESKY_API_URL || 'https://public.api.bsky.app'
} as const;
