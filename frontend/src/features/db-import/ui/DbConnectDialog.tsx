import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { useIntrospect, useListSchemas } from '../api/useIntrospect'
import type { IntrospectDialect } from '../model/types'

export interface DbConnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once with converted DBML + the database name (suggested project
   *  name) + the schemas used on a successful, fully-converted introspection. */
  onIntrospected: (
    dbml: string,
    databaseName: string,
    schemas: string[],
  ) => void | Promise<void>
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
  const { t } = useTranslation()
  const introspect = useIntrospect()
  const listSchemas = useListSchemas()
  const [dialect, setDialect] = useState<IntrospectDialect>('postgresql')
  const [host, setHost] = useState('')
  const [port, setPort] = useState(DEFAULT_PORT.postgresql)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [database, setDatabase] = useState('')
  const [available, setAvailable] = useState<string[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [ssl, setSsl] = useState(false)
  const [errors, setErrors] = useState<DbmlParseError[] | null>(null)

  function reset() {
    setDialect('postgresql')
    setHost('')
    setPort(DEFAULT_PORT.postgresql)
    setUsername('')
    setPassword('')
    setDatabase('')
    setAvailable(null)
    setSelected([])
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
    setAvailable(null)
    setSelected([])
    setErrors(null)
  }

  async function handleLoadSchemas() {
    setErrors(null)
    try {
      const res = await listSchemas.mutateAsync({
        dialect, host, port, username, password, database, ssl,
      })
      setAvailable(res.schemas)
      setSelected(res.schemas.includes('public') ? ['public'] : [])
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : t('dbConnect.failedConnect')
      setErrors([{ message }])
    }
  }

  function toggleSchema(name: string) {
    setSelected((cur) =>
      cur.includes(name) ? cur.filter((s) => s !== name) : [...cur, name],
    )
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
        db_schemas: dialect === 'postgresql' ? selected : undefined,
        ssl,
      })
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : t('dbConnect.failedConnect')
      setErrors([{ message }])
      return
    }
    const result = importSqlToDbml(response.ddl, response.import_dialect)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    try {
      await onIntrospected(result.dbml, database, selected)
    } catch (err) {
      setErrors([
        {
          message:
            err instanceof Error ? err.message : t('dbConnect.failedCreate'),
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
          <DialogTitle>{t('dbConnect.title')}</DialogTitle>
          <DialogDescription>{t('dbConnect.desc')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="db-connect-dialect">
            {t('dbConnect.database')}
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
              {t('dbConnect.host')}
              <input
                data-testid="db-connect-host"
                placeholder={t('dbConnect.host')}
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex w-28 flex-col gap-1 text-sm font-medium">
              {t('dbConnect.port')}
              <input
                data-testid="db-connect-port"
                type="number"
                placeholder={t('dbConnect.port')}
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className={inputClass}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium">
            {t('dbConnect.username')}
            <input
              data-testid="db-connect-username"
              placeholder={t('dbConnect.username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t('dbConnect.password')}
            <input
              data-testid="db-connect-password"
              type="password"
              placeholder={t('dbConnect.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t('dbConnect.database')}
            <input
              data-testid="db-connect-database"
              placeholder={t('dbConnect.database')}
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              className={inputClass}
            />
          </label>
          {dialect === 'postgresql' && (
            <div className="flex flex-col gap-1 text-sm font-medium">
              <div className="flex items-center justify-between">
                <span>{t('dbConnect.schemas')}</span>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="db-connect-load-schemas"
                  onClick={handleLoadSchemas}
                  disabled={
                    listSchemas.isPending ||
                    host.trim().length === 0 ||
                    database.trim().length === 0
                  }
                >
                  {listSchemas.isPending
                    ? t('dbConnect.loadingSchemas')
                    : t('dbConnect.loadSchemas')}
                </Button>
              </div>
              {available !== null && (
                <div className="flex flex-col gap-1">
                  {available.length === 0 && (
                    <span className="text-muted-foreground">
                      {t('dbConnect.noSchemas')}
                    </span>
                  )}
                  {available.map((name) => (
                    <label key={name} className="flex items-center gap-2 font-normal">
                      <input
                        type="checkbox"
                        data-testid={`db-connect-schema-option-${name}`}
                        checked={selected.includes(name)}
                        onChange={() => toggleSchema(name)}
                      />
                      {name}
                    </label>
                  ))}
                  <span className="text-xs text-muted-foreground">
                    {t('dbConnect.selectSchemaHint')}
                  </span>
                </div>
              )}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              data-testid="db-connect-ssl"
              type="checkbox"
              checked={ssl}
              onChange={(e) => setSsl(e.target.checked)}
            />
            {t('dbConnect.useSsl')}
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
            <Button variant="outline">{t('common.cancel')}</Button>
          </DialogClose>
          <Button
            onClick={handleConnect}
            disabled={
              introspect.isPending ||
              host.trim().length === 0 ||
              database.trim().length === 0 ||
              !(port > 0) ||
              (dialect === 'postgresql' && selected.length === 0)
            }
          >
            {introspect.isPending ? t('dbConnect.connecting') : t('dbConnect.connect')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
