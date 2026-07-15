/**
 * Copy text to the clipboard, returning whether it succeeded.
 *
 * `navigator.clipboard` only exists in a secure context (https or localhost),
 * so on an http:// deployment (e.g. an internal IP) it is undefined and a naive
 * `navigator.clipboard?.writeText(...)` silently does nothing. This helper falls
 * back to the legacy `document.execCommand('copy')` via a hidden textarea so
 * copy works on insecure origins too, and reports real success/failure so the
 * UI never claims "copied" when nothing was copied.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the execCommand fallback
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    // Keep it out of view and non-disruptive to scroll/focus.
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    textarea.setAttribute('readonly', '')
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
