import { useState } from 'react'
import {
  importSqlToDbml,
  SQL_DIALECTS,
  SQL_DIALECT_VALUES,
  type SqlDialect,
  type DbmlParseError,
} from '@/entities/dbml'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/shared/ui/dialog'

export interface SqlImportDialogProps {
  /** Controlled open state of the modal. */
  open: boolean
  /** Close request (Esc / overlay / Cancel / after a successful import). */
  onOpenChange: (open: boolean) => void
  /** True when the editor currently holds non-empty DBML — drives the
   *  overwrite-confirm step before a successful import replaces the text. */
  hasExistingContent: boolean
  /** Called ONCE with the converted DBML string on a successful, confirmed
   *  import. pages calls setDbmlText(dbml) with this value. */
  onImport: (dbml: string) => void
}

/**
 * The SQL import modal. Owns the conversion: on Import it calls
 * importSqlToDbml and, on success, reports the DBML up via onImport. Import
 * errors render inside the dialog (self-contained) so a failed import never
 * touches editor state. When existing content is present, a successful
 * conversion is gated behind an inline overwrite-confirm.
 * features layer: depends on shared/ui + entities/dbml (FSD downward imports).
 */
export function SqlImportDialog({
  open,
  onOpenChange,
  hasExistingContent,
  onImport,
}: SqlImportDialogProps) {
  const [dialect, setDialect] = useState<SqlDialect>('postgres')
  const [sqlText, setSqlText] = useState('')
  const [errors, setErrors] = useState<DbmlParseError[] | null>(null)
  const [pendingDbml, setPendingDbml] = useState<string | null>(null)

  function reset() {
    setDialect('postgres')
    setSqlText('')
    setErrors(null)
    setPendingDbml(null)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function commit(dbml: string) {
    onImport(dbml)
    reset()
    onOpenChange(false)
  }

  function handleImport() {
    const result = importSqlToDbml(sqlText, dialect)
    if (!result.ok) {
      setErrors(result.errors)
      setPendingDbml(null)
      return
    }
    setErrors(null)
    if (hasExistingContent) {
      setPendingDbml(result.dbml)
      return
    }
    commit(result.dbml)
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    try {
      const text = await file.text()
      setSqlText(text)
      setErrors(null)
      setPendingDbml(null)
    } catch {
      setErrors([{ message: 'Could not read the selected file' }])
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import SQL</DialogTitle>
          <DialogDescription>
            Paste a SQL schema or upload a .sql file. The converted DBML
            replaces the current editor content.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="sql-import-dialect"
            className="text-sm font-medium"
          >
            Dialect
          </label>
          <select
            id="sql-import-dialect"
            data-testid="sql-import-dialect"
            value={dialect}
            onChange={(e) => {
              setDialect(e.target.value as SqlDialect)
              setPendingDbml(null)
            }}
            className="h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none"
          >
            {SQL_DIALECT_VALUES.map((d) => (
              <option key={d} value={d}>
                {SQL_DIALECTS[d].label}
              </option>
            ))}
          </select>
        </div>

        <textarea
          data-testid="sql-import-textarea"
          value={sqlText}
          onChange={(e) => {
            setSqlText(e.target.value)
            setPendingDbml(null)
          }}
          placeholder="CREATE TABLE …"
          rows={8}
          className="w-full rounded-md border border-border bg-background p-2 font-mono text-sm outline-none"
        />

        <label className="text-sm">
          <span className="mb-1 block font-medium">Or upload a .sql file</span>
          <input
            type="file"
            accept=".sql,text/plain"
            data-testid="sql-file-input"
            onChange={(e) => {
              void handleFile(e.target.files?.[0])
              e.target.value = ''
            }}
            className="block text-sm"
          />
        </label>

        {errors && (
          <ul
            role="alert"
            aria-live="polite"
            className="flex flex-col gap-1"
          >
            {errors.map((err, i) => (
              <li key={i} className="text-sm text-red-700">
                {err.message}
                {typeof err.line === 'number' &&
                  typeof err.column === 'number' && (
                    <span className="ml-2 text-xs text-red-500">
                      (line {err.line}, column {err.column})
                    </span>
                  )}
              </li>
            ))}
          </ul>
        )}

        {pendingDbml !== null ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-amber-700">
              This replaces the current editor content.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setPendingDbml(null)}
              >
                Cancel
              </Button>
              <Button onClick={() => commit(pendingDbml)}>
                Confirm overwrite
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleImport}>Import</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
