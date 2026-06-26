import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Popover, PopoverTrigger, PopoverContent } from '@/shared/ui/popover'
import { Input } from '@/shared/ui/input'
import { Button } from '@/shared/ui/button'
import { ProjectGlyph, useUpdateProject, type Project } from '@/entities/project'
import {
  PROJECT_BG_COLOR_KEYS,
  PROJECT_ICON_COLOR_KEYS,
  PROJECT_FG_COLORS,
  PROJECT_BG_COLORS,
  PROJECT_GLYPH_PALETTE,
  GLYPH_MAX_LENGTH,
  resolveGlyphIcon,
  CHECKER_SWATCH,
} from '@/entities/project/model/glyph'
import { cn } from '@/shared/lib/utils'

/**
 * Editable glyph badge: the project's ProjectGlyph as a popover trigger. The
 * popover offers color swatches, a quick emoji palette, and a free-text input
 * (emoji or 1-2 chars). Each choice issues an independent PATCH.
 */
export function ProjectGlyphPicker({ project }: { project: Project }) {
  const { t } = useTranslation()
  const update = useUpdateProject(project.id)
  const [text, setText] = useState('')

  return (
    <Popover>
      <PopoverTrigger
        aria-label={t('glyph.changeIcon')}
        className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ProjectGlyph
          glyph={project.glyph}
          color={project.color}
          bgColor={project.bg_color}
          size={32}
        />
      </PopoverTrigger>
      <PopoverContent>
        {/* 아이콘·글씨색 (투명 제외 — 보여야 함) */}
        <div className="mb-1 text-xs font-medium text-muted-foreground">
          {t('glyph.iconColorLabel')}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PROJECT_ICON_COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={t('glyph.iconColorAria', { key })}
              onClick={() => update.mutate({ color: key })}
              className={cn(
                'size-6 rounded-full border border-border',
                project.color === key &&
                  'ring-2 ring-ring ring-offset-1 ring-offset-background',
              )}
              style={{ backgroundColor: PROJECT_FG_COLORS[key] }}
            />
          ))}
        </div>

        {/* 배경색 (투명 포함) */}
        <div className="mt-3 mb-1 text-xs font-medium text-muted-foreground">
          {t('glyph.bgColorLabel')}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PROJECT_BG_COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={t('glyph.bgColorAria', { key })}
              onClick={() => update.mutate({ bg_color: key })}
              className={cn(
                'size-6 rounded-full border border-border',
                project.bg_color === key &&
                  'ring-2 ring-ring ring-offset-1 ring-offset-background',
              )}
              style={
                key === 'transparent'
                  ? CHECKER_SWATCH
                  : { backgroundColor: PROJECT_BG_COLORS[key] }
              }
            />
          ))}
        </div>

        <div className="mt-3 grid grid-cols-8 gap-1">
          {PROJECT_GLYPH_PALETTE.map((g) => {
            const Icon = resolveGlyphIcon(g)
            const name = g.slice(1)
            return (
              <button
                key={g}
                type="button"
                data-testid={`glyph-option-${name}`}
                aria-label={t('glyph.iconAria', { name })}
                onClick={() => update.mutate({ glyph: g })}
                className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {Icon ? <Icon size={17} /> : <span className="text-base">{g}</span>}
              </button>
            )
          })}
        </div>

        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const v = text.trim()
            if (v) update.mutate({ glyph: v })
            setText('')
          }}
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={GLYPH_MAX_LENGTH}
            placeholder={t('glyph.customInput')}
            className="h-8"
          />
          <Button type="submit" size="sm" variant="outline">
            {t('glyph.set')}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
