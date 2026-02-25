/**
 * Read-only AT Protocol client for stats queries.
 * No auth required — public data only.
 */

import {
  CompositeDidDocumentResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver
} from '@atcute/identity-resolver';
import { ENDPOINTS } from './endpoints.js';

/** Max actors per getProfiles request (Bluesky API limit) */
const GET_PROFILES_BATCH_SIZE = 25;

// Cache for resolved PDS endpoints
const pdsCache = new Map<string, string>();

/**
 * Resolve PDS endpoint from DID
 */
async function resolvePdsEndpoint(did: string): Promise<string | null> {
  if (pdsCache.has(did)) {
    return pdsCache.get(did)!;
  }

  try {
    const resolver = new CompositeDidDocumentResolver({
      methods: {
        plc: new PlcDidDocumentResolver(),
        web: new WebDidDocumentResolver()
      }
    });

    const doc = await resolver.resolve(did as `did:plc:${string}` | `did:web:${string}`);
    // Extract PDS endpoint from DID document
    const service = doc?.service?.find((s: any) => s.id === '#atproto_pds');
    let pds: string | null = null;

    if (service?.serviceEndpoint) {
      if (typeof service.serviceEndpoint === 'string') {
        pds = service.serviceEndpoint;
      } else if (Array.isArray(service.serviceEndpoint) && service.serviceEndpoint.length > 0) {
        pds = typeof service.serviceEndpoint[0] === 'string' ? service.serviceEndpoint[0] : null;
      }
    }

    if (pds) {
      pdsCache.set(did, pds);
      return pds;
    }
  } catch (error) {
    console.warn(`Failed to resolve PDS for ${did}:`, error);
  }

  return null;
}

export type BskyProfile = {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
};

export type AtRecord = {
  uri: string;
  cid: string;
  value: Record<string, unknown>;
};

export type ListRecordsResponse = {
  records: AtRecord[];
  cursor?: string;
};

/**
 * List all repos (DIDs) that have records in a given collection.
 * Paginates through all results automatically.
 */
export async function listReposByCollection(collection: string): Promise<string[]> {
  const allDids: string[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL('/xrpc/com.atproto.sync.listReposByCollection', ENDPOINTS.RELAY_URL);
    url.searchParams.set('collection', collection);
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetch(url.toString());
    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'no body');
      console.error(`listReposByCollection failed for ${collection}: ${response.status}`, errorBody);
      throw new Error(`listReposByCollection failed: ${response.status} ${response.statusText}. ${errorBody}`);
    }

    const data = await response.json();
    for (const repo of data.repos ?? []) {
      if (repo.did) allDids.push(repo.did);
    }
    cursor = data.cursor;
  } while (cursor);

  return allDids;
}

/**
 * List records for a DID in a collection via PDS or Slingshot.
 * Returns up to `limit` records plus a cursor if more exist.
 */
export async function listRecords(
  did: string,
  collection: string,
  options: { limit?: number; cursor?: string } = {}
): Promise<ListRecordsResponse> {
  const { limit = 100, cursor } = options;

  // Resolve PDS endpoint from DID
  const pdsUrl = await resolvePdsEndpoint(did);
  const serviceUrl = pdsUrl || ENDPOINTS.SLINGSHOT_URL;

  const url = new URL('/xrpc/com.atproto.repo.listRecords', serviceUrl);
  url.searchParams.set('repo', did);
  url.searchParams.set('collection', collection);
  url.searchParams.set('limit', limit.toString());
  if (cursor) url.searchParams.set('cursor', cursor);

  try {
    const response = await fetch(url.toString(), {
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'no body');
      console.error(`listRecords failed for ${serviceUrl}: ${response.status} ${response.statusText}`, errorBody);

      // If PDS fails and we haven't tried Slingshot yet, try it
      if (pdsUrl && serviceUrl === pdsUrl) {
        console.warn(`PDS request failed for ${pdsUrl}, trying Slingshot`);
        const fallbackUrl = new URL('/xrpc/com.atproto.repo.listRecords', ENDPOINTS.SLINGSHOT_URL);
        fallbackUrl.searchParams.set('repo', did);
        fallbackUrl.searchParams.set('collection', collection);
        fallbackUrl.searchParams.set('limit', limit.toString());
        if (cursor) fallbackUrl.searchParams.set('cursor', cursor);

        const fallbackResponse = await fetch(fallbackUrl.toString());
        if (!fallbackResponse.ok) {
          const fbBody = await fallbackResponse.text().catch(() => 'no body');
          console.error(`Slingshot fallback failed: ${fallbackResponse.status}`, fbBody);
          throw new Error(`listRecords failed: ${fallbackResponse.status} ${fallbackResponse.statusText}. ${fbBody}`);
        }
        return fallbackResponse.json();
      }

      throw new Error(`listRecords failed: ${response.status} ${response.statusText}. ${errorBody}`);
    }

    return response.json();
  } catch (error) {
    // Final attempt at Slingshot if anything else failed and we hadn't used it as primary
    if (serviceUrl !== ENDPOINTS.SLINGSHOT_URL) {
      const fallbackUrl = new URL('/xrpc/com.atproto.repo.listRecords', ENDPOINTS.SLINGSHOT_URL);
      fallbackUrl.searchParams.set('repo', did);
      fallbackUrl.searchParams.set('collection', collection);
      fallbackUrl.searchParams.set('limit', limit.toString());
      if (cursor) fallbackUrl.searchParams.set('cursor', cursor);

      const fallbackResponse = await fetch(fallbackUrl.toString());
      if (fallbackResponse.ok) return fallbackResponse.json();
    }
    throw error;
  }
}

/**
 * Fetch all records for a DID in a collection (paginates automatically).
 */
export async function listAllRecords(did: string, collection: string): Promise<AtRecord[]> {
  const all: AtRecord[] = [];
  let cursor: string | undefined;

  do {
    const page = await listRecords(did, collection, { limit: 100, cursor });
    all.push(...page.records);
    cursor = page.cursor;
  } while (cursor);

  return all;
}

/**
 * Get multiple Bluesky profiles in batched requests.
 * Returns a Map of did → profile (null if not found).
 */
export async function getProfiles(actors: string[]): Promise<Map<string, BskyProfile | null>> {
  const result = new Map<string, BskyProfile | null>();
  const unique = [...new Set(actors)].filter(Boolean);
  if (unique.length === 0) return result;

  for (let i = 0; i < unique.length; i += GET_PROFILES_BATCH_SIZE) {
    const batch = unique.slice(i, i + GET_PROFILES_BATCH_SIZE);
    const url = new URL('/xrpc/app.bsky.actor.getProfiles', ENDPOINTS.BLUESKY_API_URL);
    batch.forEach((actor) => url.searchParams.append('actors', actor));

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        batch.forEach((did) => result.set(did, null));
        continue;
      }
      const data = await response.json();
      const profiles: BskyProfile[] = data?.profiles ?? [];
      // Map by DID
      const byDid = new Map(profiles.map((p) => [p.did, p]));
      batch.forEach((did) => result.set(did, byDid.get(did) ?? null));
    } catch {
      batch.forEach((did) => result.set(did, null));
    }
  }

  return result;
}

/**
 * Resolve a handle to DID.
 */
export async function resolveHandle(handle: string): Promise<string> {
  const url = new URL('/xrpc/com.atproto.identity.resolveHandle', ENDPOINTS.BLUESKY_API_URL);
  url.searchParams.set('handle', handle);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`resolveHandle failed: ${response.status}`);
  }

  const data = await response.json();
  return data.did as string;
}
