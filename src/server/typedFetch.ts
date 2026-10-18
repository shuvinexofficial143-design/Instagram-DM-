/** Use the runtime's Fetch API and DOM request/response types together.
 * Resolve at call time so platform instrumentation and test transports apply.
 * Node 22+ (CI and production) provides native fetch.
 */
export function typedFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(url, init);
}
