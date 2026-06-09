import { useState } from 'react'
import { importSqlToDbml, type DbmlParseError } from '@/entities/dbml'
import { ApiError } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/shared/ui/dialog'
import { useIntrospect } from '../api/useIntrospect'
import type { IntrospectDialect } from '../model/types'

export interface DbConnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once with converted DBML + the database name (suggested project
   *  name) on a successful, fully-converted introspection. */
  onIntrospected: (dbml: string, databaseName: string) => void | Promise<void>
}

const DEFAULT_PORT: Record<IntrospectDialect, number> = {
  postgresql: 5432,
  mariadb: 3306,
}

/**
 * DB connection modal. Collects connection params, calls /api/introspect, then
 * converts the returned DDL to DBML via @dbml/core (entities/dbml). Errors from
 * the introspect call or the DBML conversion render inside the dialog and never
 * call onIntrospected. Reusable by Phase 2 (sync). features layer: depends on
 * shared/ui + entities/dbml + this feature's api (FSD downward imports).
 */
export function DbConnectDialog({
  open,
  onOpenChange,
  onIntrospected,
}: DbConnectDialogProps) {
  const introspect = useIntrospect()
  const [dialect, setDialect] = useState<IntrospectDialect>('postgresql')
  const [host, setHost] = useState('')
  const [port, setPort] = useState(DEFAULT_PORT.postgresql)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [database, setDatabase] = useState('')
  const [schema, setSchema] = useState('public')
  const [ssl, setSsl] = useState(false)
  const [errors, setErrors] = useState<DbmlParseError[] | null>(null)

  function reset() {
    setDialect('postgresql')
    setHost('')
    setPort(DEFAULT_PORT.postgresql)
    setUsername('')
    setPassword('')
    setDatabase('')
    setSchema('public')
    setSsl(false)
    setErrors(null)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function handleDialectChange(next: IntrospectDialect) {
    setDialect(next)
    setPort(DEFAULT_PORT[next])
    setErrors(null)
  }

  async function handleConnect() {
    setErrors(null)
    let response
    try {
      response = await introspect.mutateAsync({
        dialect,
        host,
        port,
        username,
        password,
        database,
        db_schema: dialect === 'postgresql' ? schema || 'public' : null,
        ssl,
      })
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Failed to connect to the database'
      setErrors([{ message }])
      return
    }
    const result = importSqlToDbml(response.ddl, response.import_dialect)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    try {
      await onIntrospected(result.dbml, database)
    } catch (err) {
      setErrors([
        {
          message:
            err instanceof Error ? err.message : 'Failed to create the project',
        },
      ])
      return
    }
    reset()
    onOpenChange(false)
  }

  const inputClass =
    'h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect to Database</DialogTitle>
          <DialogDescription>
            Read a live PostgreSQL or MariaDB schema into a new project.
            Credentials are used once and never stored.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="db-connect-dialect">
            Database
          </label>
          <select
            id="db-connect-dialect"
            data-testid="db-connect-dialect"
            value={dialect}
            onChange={(e) =>
              handleDialectChange(e.target.value as IntrospectDialect)
            }
            className={inputClass}
          >
            <option value="postgresql">PostgreSQL</option>
            <option value="mariadb">MariaDB</option>
          </select>

          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
              Host
              <input
                data-testid="db-connect-host"
                placeholder="Host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex w-28 flex-col gap-1 text-sm font-medium">
              Port
              <input
                data-testid="db-connect-port"
                type="number"
                placeholder="Port"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className={inputClass}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Username
            <input
              data-testid="db-connect-username"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Password
            <input
              data-testid="db-connect-password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Database
            <input
              data-testid="db-connect-database"
              placeholder="Database"
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              className={inputClass}
            />
          </label>
          {dialect === 'postgresql' && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Schema (default: public)
              <input
                data-testid="db-connect-schema"
                placeholder="Schema (default: public)"
                value={schema}
                onChange={(e) => setSchema(e.target.value)}
                className={inputClass}
              />
            </label>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              data-testid="db-connect-ssl"
              type="checkbox"
              checked={ssl}
              onChange={(e) => setSsl(e.target.checked)}
            />
            Use SSL/TLS
          </label>
        </div>

        {errors && (
          <ul role="alert" aria-live="polite" className="flex flex-col gap-1">
            {errors.map((err, i) => (
              <li key={i} className="text-sm text-red-700">
                {err.message}
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={handleConnect}
            disabled={
              introspect.isPending ||
              host.trim().length === 0 ||
              database.trim().length === 0 ||
              !(port > 0)
            }
          >
            {introspect.isPending ? 'Connecting…' : 'Connect'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
