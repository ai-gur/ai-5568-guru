import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * Defaults on purpose.
 *
 * OpenNext can add incremental-cache and tag-cache backends on KV or R2. This
 * app has nothing worth caching between requests — every page is either static
 * or a live view of a scan that must never be served stale — so adding them
 * would be deployment surface with no effect.
 */
export default defineCloudflareConfig();
