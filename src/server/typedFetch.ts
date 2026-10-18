import { fetch as undiciFetch } from 'undici';

/** Bridge Undici's Node fetch types to the DOM types used throughout the API.
 * Runtime request/response objects are compatible; the two type packages
 * disagree on stream and FormData declarations.
 */
export const typedFetch = undiciFetch as unknown as (
  url: string | URL,
  init?: RequestInit
) => Promise<Response>;
