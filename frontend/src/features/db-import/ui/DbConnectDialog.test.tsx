import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import i18n from '@/shared/i18n'
import { render, screen } from '@testing-library/react'

// 이 스위트는 영어 라벨/문구를 단언하므로 인터페이스 언어를 en으로 고정한다.
beforeAll(async () => {
  await i18n.changeLanguage('en')
})
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { DbConnectDialog } from './DbConnectDialog'
import { ApiError } from '@/shared/api/client'

const mutateAsync = vi.fn()
const listSchemasMutateAsync = vi.fn()
vi.mock('../api/useIntrospect', () => ({
  useIntrospect: () => ({ mutateAsync, isPending: false }),
  useListSchemas: () => ({ mutateAsync: listSchemasMutateAsync, isPending: false }),
}))

const setup = () =>
  userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

async function fillRequired(user: ReturnType<typeof setup>) {
  await user.type(screen.getByTestId('db-connect-host'), 'localhost')
  await user.type(screen.getByTestId('db-connect-username'), 'postgres')
  await user.type(screen.getByTestId('db-connect-password'), 'secret')
  await user.type(screen.getByTestId('db-connect-database'), 'mydb')
}

describe('DbConnectDialog', () => {
  beforeEach(() => {
    mutateAsync.mockReset()
    listSchemasMutateAsync.mockReset()
  })

  it('introspects then converts DDL and reports DBML + db name up', async () => {
    const user = setup()
    const onIntrospected = vi.fn()
    listSchemasMutateAsync.mockResolvedValueOnce({ schemas: ['public'] })
    mutateAsync.mockResolvedValueOnce({
      import_dialect: 'postgres',
      ddl: 'CREATE TABLE users (id SERIAL PRIMARY KEY, email VARCHAR(255) NOT NULL);',
      table_count: 1,
    })
    render(
      <DbConnectDialog open onOpenChange={vi.fn()} onIntrospected={onIntrospected} />,
    )
    await fillRequired(user)
    // load schemas first so Connect becomes enabled
    await user.click(screen.getByTestId('db-connect-load-schemas'))
    await user.click(screen.getByRole('button', { name: 'Connect' }))

    expect(mutateAsync).toHaveBeenCalledTimes(1)
    const sentReq = mutateAsync.mock.calls[0][0]
    expect(sentReq.dialect).toBe('postgresql')
    expect(sentReq.database).toBe('mydb')
    expect(sentReq.db_schemas).toEqual(['public'])

    expect(onIntrospected).toHaveBeenCalledTimes(1)
    const [dbml, dbName] = onIntrospected.mock.calls[0]
    expect(dbml).toContain('users')
    expect(dbName).toBe('mydb')
  })

  it('shows an alert and does NOT report up on introspect failure', async () => {
    const user = setup()
    const onIntrospected = vi.fn()
    listSchemasMutateAsync.mockResolvedValueOnce({ schemas: ['public'] })
    mutateAsync.mockRejectedValueOnce(new ApiError('connection refused', 502))
    render(
      <DbConnectDialog open onOpenChange={vi.fn()} onIntrospected={onIntrospected} />,
    )
    await fillRequired(user)
    await user.click(screen.getByTestId('db-connect-load-schemas'))
    await user.click(screen.getByRole('button', { name: 'Connect' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('connection refused')
    expect(onIntrospected).not.toHaveBeenCalled()
  })

  it('shows an alert when DDL cannot be converted to DBML', async () => {
    const user = setup()
    const onIntrospected = vi.fn()
    listSchemasMutateAsync.mockResolvedValueOnce({ schemas: ['public'] })
    mutateAsync.mockResolvedValueOnce({
      import_dialect: 'postgres',
      ddl: 'CREATE TABLE ((( not valid',
      table_count: 0,
    })
    render(
      <DbConnectDialog open onOpenChange={vi.fn()} onIntrospected={onIntrospected} />,
    )
    await fillRequired(user)
    await user.click(screen.getByTestId('db-connect-load-schemas'))
    await user.click(screen.getByRole('button', { name: 'Connect' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onIntrospected).not.toHaveBeenCalled()
  })

  it('hides the schema section for MariaDB and sends db_schemas undefined', async () => {
    const user = setup()
    const onIntrospected = vi.fn()
    mutateAsync.mockResolvedValueOnce({
      import_dialect: 'mysql',
      ddl: 'CREATE TABLE t (id INT PRIMARY KEY);',
      table_count: 1,
    })
    render(
      <DbConnectDialog open onOpenChange={vi.fn()} onIntrospected={onIntrospected} />,
    )
    await user.selectOptions(screen.getByTestId('db-connect-dialect'), 'mariadb')
    expect(screen.queryByTestId('db-connect-load-schemas')).toBeNull()
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Connect' }))

    expect(mutateAsync.mock.calls[0][0].db_schemas).toBeUndefined()
    expect(mutateAsync.mock.calls[0][0].dialect).toBe('mariadb')
  })

  it('keeps the dialog open and shows an alert if onIntrospected fails', async () => {
    const user = setup()
    const onIntrospected = vi.fn().mockRejectedValueOnce(new Error('save failed'))
    const onOpenChange = vi.fn()
    listSchemasMutateAsync.mockResolvedValueOnce({ schemas: ['public'] })
    mutateAsync.mockResolvedValueOnce({
      import_dialect: 'postgres',
      ddl: 'CREATE TABLE users (id SERIAL PRIMARY KEY);',
      table_count: 1,
    })
    render(
      <DbConnectDialog open onOpenChange={onOpenChange} onIntrospected={onIntrospected} />,
    )
    await fillRequired(user)
    await user.click(screen.getByTestId('db-connect-load-schemas'))
    await user.click(screen.getByRole('button', { name: 'Connect' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('save failed')
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('disables Connect when the port is cleared', async () => {
    const user = setup()
    listSchemasMutateAsync.mockResolvedValueOnce({ schemas: ['public'] })
    render(
      <DbConnectDialog open onOpenChange={vi.fn()} onIntrospected={vi.fn()} />,
    )
    await fillRequired(user)
    await user.click(screen.getByTestId('db-connect-load-schemas'))
    await user.clear(screen.getByTestId('db-connect-port'))
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled()
  })

  it('loads schemas, lets the user pick several, and sends db_schemas', async () => {
    const user = setup()
    const onIntrospected = vi.fn()
    listSchemasMutateAsync.mockResolvedValueOnce({ schemas: ['public', 'sales'] })
    mutateAsync.mockResolvedValueOnce({
      import_dialect: 'postgres',
      ddl: 'CREATE TABLE users (id SERIAL PRIMARY KEY);',
      table_count: 1,
    })
    render(
      <DbConnectDialog open onOpenChange={vi.fn()} onIntrospected={onIntrospected} />,
    )
    await fillRequired(user)
    // click "Load schemas"
    await user.click(screen.getByTestId('db-connect-load-schemas'))
    // both checkboxes appear
    expect(screen.getByTestId('db-connect-schema-option-public')).toBeInTheDocument()
    // public is auto-checked
    expect(screen.getByTestId('db-connect-schema-option-public')).toBeChecked()
    // public is pre-selected, select sales in addition
    await user.click(screen.getByTestId('db-connect-schema-option-sales'))
    await user.click(screen.getByRole('button', { name: 'Connect' }))
    expect(onIntrospected).toHaveBeenCalledTimes(1)
    const [, , schemas] = onIntrospected.mock.calls[0]
    expect(schemas).toEqual(expect.arrayContaining(['public', 'sales']))
    const sentReq = mutateAsync.mock.calls[0][0]
    expect(sentReq.db_schemas).toEqual(expect.arrayContaining(['public', 'sales']))
    expect(sentReq.db_schemas).toHaveLength(2)
  })
})
