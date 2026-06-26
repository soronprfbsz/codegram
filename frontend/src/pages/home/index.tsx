import { useTranslation } from 'react-i18next'
import { ProjectList } from '@/features/project-list'
import { DbImportButton } from '@/features/db-import'

export function HomePage() {
  // Chrome (logo / account / theme / logout) now lives in the global sidebar;
  // the home page is the projects dashboard within the AppLayout main area.
  const { t } = useTranslation()
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-8 py-12">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-medium">
              {t('home.title')}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('home.subtitle')}
            </p>
          </div>
          <DbImportButton />
        </div>
        <ProjectList />
      </div>
    </div>
  )
}
