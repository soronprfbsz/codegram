/**
 * Show the local part of an address in tight UI. A long work address swallows
 * the sentence around it ("…@example.com 님이 편…"), which loses the only part
 * that carries meaning. Callers keep the full address in the tooltip.
 *
 * Single source (G1): the top bar's save stamp and the edit-lock note both
 * shorten addresses, and they must shorten them the same way.
 */
export function shortEmail(email: string): string {
  const at = email.indexOf('@')
  return at > 0 ? email.slice(0, at) : email
}
