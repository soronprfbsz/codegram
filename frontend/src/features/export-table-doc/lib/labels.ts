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
  /** FK section title + its column headers (FK명·컬럼·참조 테이블·참조 컬럼). */
  fks: string
  fkName: string
  fkColumns: string
  fkRefTable: string
  fkRefColumns: string
  /** Overview ("테이블 목록") sheet name + its column headers. */
  overviewSheet: string
  overviewNo: string
  overviewGroup: string
  overviewTable: string
  overviewDesc: string
  /** Sheet name for tables not in any group. */
  ungroupedSheet: string
  /** Labels for the per-table "테이블정의서" form block (Excel only). */
  form: TableDocFormLabels
}

/** Cell labels for the Excel per-table definition form (header grid + body). */
export interface TableDocFormLabels {
  /** Merged title row text. */
  title: string
  /** Header-grid labels. */
  subjectArea: string
  dbName: string
  schemaName: string
  tableName: string
  tableDesc: string
  /** Body column headers. */
  no: string
  colId: string
  type: string
  length: string
  nullable: string
  key: string
  defaultVal: string
  desc: string
  /** Trailing "기타" row label. */
  etc: string
}

/** Build the exporter labels from a translate function (single i18n source). */
export function tableDocLabels(t: TFunction): TableDocLabels {
  return {
    columnHeaders: STANDARD_COLUMNS.map((c) => t(c.header)),
    enumColEnum: t('tableDoc.enumColEnum'),
    enumColValue: t('tableDoc.enumColValue'),
    enumColNote: t('tableDoc.enumColNote'),
    enumsSheet: t('tableDoc.enums'),
    checks: t('tableDoc.checks'),
    checkName: t('tableDoc.checkName'),
    checkValues: t('tableDoc.checkValues'),
    checkExpression: t('tableDoc.checkExpression'),
    fks: t('tableDoc.fks'),
    fkName: t('tableDoc.fkName'),
    fkColumns: t('tableDoc.fkColumns'),
    fkRefTable: t('tableDoc.fkRefTable'),
    fkRefColumns: t('tableDoc.fkRefColumns'),
    overviewSheet: t('tableDoc.overviewSheet'),
    overviewNo: t('tableDoc.colNo'),
    overviewGroup: t('tableDoc.colGroup'),
    overviewTable: t('tableDoc.colTable'),
    overviewDesc: t('tableDoc.colNote'),
    ungroupedSheet: t('tableDoc.ungrouped'),
    form: {
      title: t('tableDoc.docTitle'),
      subjectArea: t('tableDoc.subjectArea'),
      dbName: t('tableDoc.dbName'),
      schemaName: t('tableDoc.schemaName'),
      tableName: t('tableDoc.tableName'),
      tableDesc: t('tableDoc.tableDesc'),
      no: t('tableDoc.colNo'),
      colId: t('tableDoc.colId'),
      type: t('tableDoc.typeShort'),
      length: t('tableDoc.length'),
      nullable: t('tableDoc.nullable'),
      key: t('tableDoc.keyLabel'),
      defaultVal: t('tableDoc.defaultLabel'),
      desc: t('tableDoc.colNote'),
      etc: t('tableDoc.etc'),
    },
  }
}
