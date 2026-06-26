import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface SnapshotCalendarProps {
  /** Visible month as YYYY-MM. */
  month: string
  /** Local date (YYYY-MM-DD) -> snapshot count; only these days are selectable. */
  countByDate: Record<string, number>
  /** Currently selected local date (YYYY-MM-DD) or null. */
  selectedDate: string | null
  onSelectDate: (date: string) => void
  onMonthChange: (month: string) => void
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const base = m - 1 + delta
  const year = y + Math.floor(base / 12)
  const monthIndex = ((base % 12) + 12) % 12
  return `${year}-${pad(monthIndex + 1)}`
}

/**
 * Minimal dependency-free month grid. Only days present in `countByDate` are
 * clickable; the rest are dimmed. Used by the snapshot history [자동] tab to
 * pick a local day whose snapshots are then listed.
 */
export function SnapshotCalendar({
  month,
  countByDate,
  selectedDate,
  onSelectDate,
  onMonthChange,
}: SnapshotCalendarProps) {
  const { t } = useTranslation()
  const weekdays = t('snapshot.weekdays', { returnObjects: true }) as string[]
  const [year, monthNum] = month.split('-').map(Number)
  const firstWeekday = new Date(year, monthNum - 1, 1).getDay()
  const daysInMonth = new Date(year, monthNum, 0).getDate()

  const cells: (string | null)[] = []
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null)
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(`${year}-${pad(monthNum)}-${pad(d)}`)
  }

  return (
    <div style={{ padding: '10px 12px' }}>
      {/* Month navigation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <button
          type="button"
          className="erd-topbar-btn"
          aria-label={t('snapshot.prevMonth')}
          onClick={() => onMonthChange(shiftMonth(month, -1))}
          style={navBtn}
        >
          <ChevronLeft size={16} />
        </button>
        <span
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--erd-text)' }}
        >
          {t('snapshot.monthLabel', { year, month: monthNum })}
        </span>
        <button
          type="button"
          className="erd-topbar-btn"
          aria-label={t('snapshot.nextMonth')}
          onClick={() => onMonthChange(shiftMonth(month, 1))}
          style={navBtn}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Weekday header */}
      <div style={gridStyle}>
        {weekdays.map((w) => (
          <div
            key={w}
            style={{
              textAlign: 'center',
              fontSize: 11,
              color: 'var(--erd-text-3)',
              padding: '2px 0',
            }}
          >
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={gridStyle}>
        {cells.map((date, i) => {
          if (date === null) return <div key={`blank-${i}`} />
          const count = countByDate[date] ?? 0
          const has = count > 0
          const selected = date === selectedDate
          const dayNum = Number(date.slice(-2))
          return (
            <button
              key={date}
              type="button"
              data-testid={`snapshot-cal-day-${date}`}
              disabled={!has}
              aria-pressed={selected}
              onClick={() => has && onSelectDate(date)}
              title={has ? t('snapshot.countTooltip', { count }) : undefined}
              style={{
                position: 'relative',
                height: 32,
                borderRadius: 6,
                border: 'none',
                fontSize: 12,
                cursor: has ? 'pointer' : 'default',
                background: selected
                  ? 'var(--erd-accent)'
                  : has
                    ? 'var(--erd-hover)'
                    : 'transparent',
                color: selected
                  ? '#fff'
                  : has
                    ? 'var(--erd-text)'
                    : 'var(--erd-text-3)',
                fontWeight: has ? 600 : 400,
                opacity: has ? 1 : 0.5,
              }}
            >
              {dayNum}
              {has && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: 3,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: selected ? '#fff' : 'var(--erd-accent)',
                  }}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  width: 28,
  height: 28,
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  color: 'var(--erd-text-2)',
  cursor: 'pointer',
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 2,
}
