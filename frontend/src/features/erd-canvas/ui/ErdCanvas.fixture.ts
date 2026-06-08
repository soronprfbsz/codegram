import type { DbmlSchema } from '@/entities/dbml'

/** Two-table fixture (`public.users` + `public.posts` with an n-1 relation)
 *  shared by ErdCanvas.test.tsx and ErdCanvas.wiring.test.tsx. Lifted verbatim
 *  from ErdCanvas.test.tsx so the node ids match in both. */
export const schema: DbmlSchema = {
  tables: [
    {
      id: 'public.users',
      name: 'users',
      schema: 'public',
      columns: [
        {
          id: 'public.users.id',
          name: 'id',
          type: 'integer',
          pk: true,
          notNull: true,
          unique: false,
          increment: true,
          isFk: false,
        },
      ],
    },
    {
      id: 'public.posts',
      name: 'posts',
      schema: 'public',
      columns: [
        {
          id: 'public.posts.user_id',
          name: 'user_id',
          type: 'integer',
          pk: false,
          notNull: true,
          unique: false,
          increment: false,
          isFk: true,
        },
      ],
    },
  ],
  refs: [
    {
      id: 'public.posts.(user_id)>public.users.(id)',
      fromTable: 'posts',
      fromSchema: 'public',
      fromColumns: ['user_id'],
      toTable: 'users',
      toSchema: 'public',
      toColumns: ['id'],
      relation: 'n-1',
    },
  ],
  enums: [],
  tableGroups: [],
  notes: [],
}
