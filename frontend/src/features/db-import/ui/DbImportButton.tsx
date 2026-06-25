import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useCreateProject } from '@/entities/project'
import { Button } from '@/shared/ui/button'
import { DbConnectDialog } from './DbConnectDialog'

/**
 * Entry point for "Connect to Database": opens DbConnectDialog and, once it
 * returns converted DBML, creates a new project and navigates into the editor
 * (empty layout -> dagre auto-arrange). Mirrors the create+navigate pattern in
 * features/project-list. features layer: composes entities/project + shared/ui
 * + this feature's dialog (FSD downward imports).
 */
export function DbImportButton() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createProject = useCreateProject()
  const [open, setOpen] = useState(false)

  async function handleIntrospected(dbml: string, databaseName: string, _schemas?: string[]) {
    const created = await createProject.mutateAsync({
      name: databaseName || t('dbConnect.importedName'),
      dbml_text: dbml,
    })
    navigate(`/editor/${created.id}`)
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {t('dbConnect.button')}
      </Button>
      <DbConnectDialog
        open={open}
        onOpenChange={setOpen}
        onIntrospected={handleIntrospected}
      />
    </>
  )
}
