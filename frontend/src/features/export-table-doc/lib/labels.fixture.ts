import type { TableDocLabels } from './labels'

/**
 * Korean exporter labels shared by the buildXlsx/buildPdf/buildDocx tests.
 *
 * The exporters take their labels as input (i18n lives outside them — see
 * tableDocLabels), so the tests inject this fixed set and assert the output
 * carries exactly these strings. Kept in ONE place: the same literal used to be
 * copy-pasted into all three test files, and two copies fell behind when new
 * labels were added (G1).
 */
export const TABLE_DOC_LABELS: TableDocLabels = {
  columnHeaders: ['컬럼명', '데이터타입', 'PK', 'FK', 'NN', 'UNIQUE', '기본값', '설명'],
  enumColEnum: 'Enum', enumColValue: '값', enumColNote: '설명', enumsSheet: 'Enums',
  checks: 'CHECK 제약', checkName: '이름', checkValues: '허용값', checkExpression: '표현식',
  fks: 'FK 제약', fkName: 'FK명', fkColumns: '컬럼', fkRefTable: '참조 테이블', fkRefColumns: '참조 컬럼',
  overviewSheet: '테이블 목록', overviewNo: 'No', overviewGroup: '그룹',
  overviewTable: '테이블', overviewDesc: '설명', ungroupedSheet: '미분류',
  form: {
    title: '테이블정의서', subjectArea: '주제영역명', dbName: 'DB 명', schemaName: '스키마명',
    tableName: '테이블명', tableDesc: '테이블설명', no: 'No', colId: '컬럼ID', type: '타입',
    length: '길이', nullable: 'NULL', key: 'KEY', defaultVal: 'DEFAULT', desc: '설명', etc: '기타',
  },
}
