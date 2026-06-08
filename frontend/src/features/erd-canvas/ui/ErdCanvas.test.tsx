import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { DbmlSchema } from '@/entities/dbml'
import { ErdCanvas, schemaSignature } from './ErdCanvas'
import { schema } from './ErdCanvas.fixture'

describe('ErdCanvas', () => {
  it('renders nodes with savedPositions provided (reconcile path) without crashing', async () => {
    const savedPositions = {
      'public.users': { x: 320, y: 80 },
      'public.posts': { x: 320, y: 360 },
    }
    render(<ErdCanvas schema={schema} savedPositions={savedPositions} />)
    // Reconcile + render must still produce both table labels.
    expect(await screen.findByText('users')).toBeInTheDocument()
    expect(screen.getByText('posts')).toBeInTheDocument()
  })

  it('renders a React Flow node per table for a valid schema', async () => {
    const { container } = render(<ErdCanvas schema={schema} />)
    // React Flow renders each node in the `nodes` array as a
    // .react-flow__node element once mounted/measured.
    const nodes = await screen.findAllByText(/users|posts/)
    expect(nodes.length).toBeGreaterThanOrEqual(2)
    // Both table labels are present in the rendered nodes.
    expect(screen.getByText('users')).toBeInTheDocument()
    expect(screen.getByText('posts')).toBeInTheDocument()
    // The canvas root mounted.
    expect(container.querySelector('.react-flow')).toBeInTheDocument()
  })

  it('shows an empty-state placeholder when no schema is provided', () => {
    render(<ErdCanvas schema={undefined} />)
    expect(screen.getByText(/no diagram yet/i)).toBeInTheDocument()
  })
})

describe('schemaSignature (stable layout memo key)', () => {
  it('is equal for two structurally-equal but distinct schema objects', () => {
    // parseDbml returns a brand-new object on every successful parse, so a
    // no-op edit (whitespace/comment/type-then-delete) yields a NEW object
    // with identical structure. The signature must NOT change, so the layout
    // memo does not recompute and the viewport does not re-fit.
    const a = schema
    const b = JSON.parse(JSON.stringify(schema)) as DbmlSchema
    expect(b).not.toBe(a) // distinct identity
    expect(schemaSignature(a)).toBe(schemaSignature(b))
  })

  it('changes when the schema actually changes structurally', () => {
    const renamed = JSON.parse(JSON.stringify(schema)) as DbmlSchema
    renamed.tables[0].name = 'accounts'
    expect(schemaSignature(renamed)).not.toBe(schemaSignature(schema))
  })

  it('maps an undefined schema to a stable empty key', () => {
    expect(schemaSignature(undefined)).toBe('')
    expect(schemaSignature(undefined)).toBe(schemaSignature(undefined))
  })
})
