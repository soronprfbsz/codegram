import type { TFunction } from 'i18next'
import { STANDARD_COLUMNS } from '@/entities/table-doc'

/**
 * Translated header strings the table-doc exporters need. The exporters are pure
 * (no i18n), so the calling component builds this from its `t` and passes it in
 * — keeping the xlsx/pdf output in the active UI language (single source: the
 * same i18n keys the HTML preview uses).
 */
export interface TableDocLabels {
  /** Standard column headers, translated, in STANDARD_COLUMNS order. */
  columnHeaders: string[]
  /** FK section header: local column / referenced target. */
  fkColumn: string
  fkReference: string
  /** Enum list header columns + the worksheet/section name. */
  enumColEnum: string
  enumColValue: string
  enumColNote: string
  enumsSheet: string
  /** CHECK constraint section title + its column headers. */
  checks: string
  checkName: string
  checkValues: string
  checkExpression: string
}

/** Build the exporter labels from a translate function (single i18n source). */
export function tableDocLabels(t: TFunction): TableDocLabels {
  return {
    columnHeaders: STANDARD_COLUMNS.map((c) => t(c.header)),
    fkColumn: t('tableDoc.column'),
    fkReference: t('tableDoc.reference'),
    enumColEnum: t('tableDoc.enumColEnum'),
    enumColValue: t('tableDoc.enumColValue'),
    enumColNote: t('tableDoc.enumColNote'),
    enumsSheet: t('tableDoc.enums'),
    checks: t('tableDoc.checks'),
    checkName: t('tableDoc.checkName'),
    checkValues: t('tableDoc.checkValues'),
    checkExpression: t('tableDoc.checkExpression'),
  }
}
