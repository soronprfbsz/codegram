import { useState } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/shared/ui/popover'
import { Input } from '@/shared/ui/input'
import { Button } from '@/shared/ui/button'
import { ProjectGlyph, useUpdateProject, type Project } from '@/entities/project'
import {
  PROJECT_COLOR_KEYS,
  PROJECT_COLORS,
  PROJECT_GLYPH_PALETTE,
  GLYPH_MAX_LENGTH,
} from '@/entities/project/model/glyph'

/**
 * Editable glyph badge: the project's ProjectGlyph as a popover trigger. The
 * popover offers color swatches, a quick emoji palette, and a free-text input
 * (emoji or 1-2 chars). Each choice issues an independent PATCH.
 */
export function ProjectGlyphPicker({ project }: { project: Project }) {
  const update = useUpdateProject(project.id)
  const [text, setText] = useState('')

  return (
    <Popover>
      <PopoverTrigger
        aria-label="프로젝트 아이콘 변경"
        className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ProjectGlyph glyph={project.glyph} color={project.color} size={32} />
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-wrap gap-1.5">
          {PROJECT_COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={`색상 ${key}`}
              onClick={() => update.mutate({ color: key })}
              className="size-6 rounded-full border border-border"
              style={{ backgroundColor: PROJECT_COLORS[key] }}
            />
          ))}
        </div>

        <div className="mt-3 grid grid-cols-8 gap-1">
          {PROJECT_GLYPH_PALETTE.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => update.mutate({ glyph: g })}
              className="grid size-7 place-items-center rounded text-base hover:bg-muted"
            >
              {g}
            </button>
          ))}
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
            placeholder="직접 입력"
            className="h-8"
          />
          <Button type="submit" size="sm" variant="outline">
            설정
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
