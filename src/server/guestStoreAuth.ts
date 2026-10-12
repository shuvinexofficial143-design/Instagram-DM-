/**
 * Private server-to-server authentication for guest workspace requests.
 * Never send this header to browser clients. It allows the account-store Edge
 * function to refuse unauthenticated direct calls that know a guest ID.
 *
 * The existing Meta app secret is already configured on Vercel and Supabase
 * for Instagram OAuth. A dedicated rotated secret can replace it later.
 */
export function guestStoreHeaders(): Record<string, string> {
  const secret = String(process.env.INSTAGRAM_APP_SECRET || '').trim();
  return secret ? { 'X-Autoreply-Guest-Secret': secret } : {};
}
