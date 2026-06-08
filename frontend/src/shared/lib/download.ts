/**
 * Trigger a browser download of `blob` named `filename` via a transient
 * object URL. Pure DOM (no React): creates an object URL, clicks a hidden
 * `<a download>`, then revokes the URL. Used by every export builder.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
