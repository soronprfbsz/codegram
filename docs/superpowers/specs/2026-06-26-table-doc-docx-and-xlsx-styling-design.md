# 테이블 정의서 DOCX 내보내기 + XLSX 스타일 설계

- 날짜: 2026-06-26
- 상태: 설계 승인됨 (구현 계획 대기)
- 관련: 기존 export 워커 패턴(`feat(export): build Table Doc in a Web Worker`), `.claude/rules/frontend.md`(F1 단일 토큰/컴포넌트, F4 i18n, F3 FSD)

## 1. 목적

테이블 정의서(Table Doc) 내보내기에 **DOCX(.docx) 포맷을 추가**하고, **XLSX에 스타일(헤더 색·컬럼 너비·테두리)을 입힌다.** 두 포맷 모두 표 형태로, 헤더 배경색·굵게·컬럼 너비를 신경 쓴 모양으로 출력한다.

## 2. 핵심 제약 (코드 근거)

- 모든 테이블 정의서 export는 단일 모델 `TableDocModel`(entities/table-doc) + 단일 컬럼 출처 `STANDARD_COLUMNS` + 번역 라벨 `tableDocLabels(t)`에서 나온다. DOCX도 같은 입력을 소비한다(단일 출처, G1/F1).
- 현재 `xlsx`는 **SheetJS 커뮤니티 에디션**(`cdn.sheetjs.com/xlsx-0.20.3`)이라 **셀 채우기색/폰트색 스타일을 지원하지 않는다.** 컬럼 너비(`!cols`)만 가능. → 헤더 배경색을 넣으려면 `exceljs`로 교체해야 한다. SheetJS는 `buildXlsx.ts`에서만 import되므로(다른 사용처 없음) 교체 가능.
- DOCX는 `docx`(dolanmiu)로 생성한다. 순수 JS, 브라우저/Web Worker에서 동작, **한글 폰트 임베딩 불필요**(jsPDF와 달리 Word가 폰트 해석).
- 기존 export는 이미 Web Worker(`tableDoc.worker.ts`) + 진행 오버레이로 동작하며, 워커 실패 시 메인스레드 폴백(`buildTableDocBlob`)이 있다. 신규 포맷도 이 경로에 올라탄다.

## 3. 결정

- **DOCX 추가** + **XLSX를 exceljs로 교체**(둘 다 이번 범위). 두 포맷에 **동일한 스타일 사양**을 적용한다.
- 헤더 색: **ERD 액센트 블루 `#3E6AE1` 배경 + 흰색 글자 + 굵게**(앱 ERD 액센트와 일치).
- 레이아웃은 PDF(`buildPdf.ts`)와 동일: 테이블마다 `schema.name`(+ note) 제목 → 컬럼 표 → (있으면) FK 표 → (있으면) CHECK 표, 마지막에 Enum 목록 표.
- 테이블별 개별 `headerColor` 반영은 범위 밖(모델에 없음). 균일 헤더 색.

## 4. 스타일 사양 (DOCX·XLSX 공통 단일 상수: `lib/tableDocStyle.ts`)

- `HEADER_FILL = '3E6AE1'`(앞 `#` 없는 6자리 hex — exceljs ARGB/docx 모두 사용), `HEADER_TEXT = 'FFFFFF'`, 헤더 굵게.
- `GRID_BORDER = 'D1D5DB'`(얇은 회색 테두리, 전 셀).
- **컬럼 너비 가중치**(STANDARD_COLUMNS 순서, 단일 정의): 이름/타입/기본값/설명은 넓게, PK·FK·NN·UNIQUE 플래그는 좁게.
  - 가중치 예: `name 22, type 18, pk 6, fk 6, nn 6, unique 8, default 18, note 30` (문자폭 기준 단위).
  - XLSX: 이 값을 `column.width`(문자폭)로 직접 사용.
  - DOCX: 같은 가중치를 표 전체 폭에 대한 비율(`WidthType.PERCENTAGE`)로 환산.
- FK 표(2열: 컬럼/참조), CHECK 표(3열), Enum 표(3열)도 같은 헤더 스타일 + 테두리.

## 5. 구조 & 파일 (FSD)

신규/변경:
- **Create** `frontend/src/features/export-table-doc/lib/tableDocStyle.ts` — 공통 색/너비 가중치 상수.
- **Create** `frontend/src/features/export-table-doc/lib/buildDocx.ts` — `buildTableDocDocxBlob(model, labels): Promise<Blob>` (docx 사용; PDF와 동일 레이아웃; `Packer.toBlob`).
- **Modify** `frontend/src/features/export-table-doc/lib/buildXlsx.ts` — exceljs로 재작성. `buildTableDocXlsxBlob(model, labels): Promise<Blob>` (**async가 됨** — `workbook.xlsx.writeBuffer()`). 시트 구조 유지(테이블당 1시트, 31자 클램프 + 중복 회피, 마지막 Enums 시트), 헤더 스타일·컬럼 너비·테두리 추가.
- **Modify** `frontend/src/features/export-table-doc/lib/tableDoc.worker.ts` — `kind: 'xlsx' | 'pdf' | 'docx'`, xlsx도 `await`.
- **Modify** `frontend/src/features/export-table-doc/lib/exportTableDoc.ts` — `TableDocExportKind`에 `'docx'` 추가; 폴백 분기에 docx 추가; xlsx await.
- **Modify** `frontend/src/features/export-table-doc/index.ts` — `buildTableDocDocxBlob` export.
- **Modify** `frontend/src/widgets/export-menu/ui/ExportMenu.tsx` — "테이블 정의서 Word" 항목 추가(`buildTableDocBlob('docx', …)` → `table-definition.docx`).
- **Modify** `frontend/src/widgets/table-doc-view/ui/TableDocViewHost.tsx` — 미리보기 오버레이에 Word 다운로드 추가(`onDownloadDocx`). (※ `TableDocView`에 `onDownloadDocx` prop + 버튼 추가가 필요하면 함께.)
- **Modify** `frontend/src/shared/i18n/locales/{ko,en}.json` — `exportMenu.tableDocWord`(+ 미리보기 버튼 라벨이 필요하면 `tableDoc.*`).
- **package.json**: `+docx`, `+exceljs`, `-xlsx`(SheetJS — 다른 사용처 없음 확인 후 제거).

데이터 흐름: `deriveTableDoc(schema)` → `TableDocModel` → 워커(`buildTableDocBlob(kind, model, tableDocLabels(t))`) → 포맷별 빌더 → Blob → `downloadBlob`. 진행 오버레이는 기존대로.

## 6. 비동기 시그니처 파급

- `buildTableDocXlsxBlob`이 sync → **async**가 된다. 영향: 워커 디스패처(await), `buildTableDocBlob` 폴백(await), `buildXlsx.test.ts`(await). `ExportMenu`/`TableDocViewHost`는 `buildTableDocBlob`(이미 async)만 호출하므로 무영향.

## 7. 검증 (TDD)

- **buildXlsx**(exceljs): 결과 버퍼를 **exceljs로 되읽어** 시트명·헤더 셀 값·**헤더 채우기색(`3E6AE1`)**·컬럼 너비·셀 값을 단언(기존 mock 기반 테스트를 실제-버퍼 검증으로 재작성; 기존 `checks` 타입 누락도 해소).
- **buildDocx**: 대표 모델(빈/컬럼/FK/CHECK/enum)에 대해 (a) 비어있지 않은 Blob, (b) docx zip(`word/document.xml`)에 테이블명·컬럼 헤더 라벨 문자열 포함을 단언(zip 해제 후 문자열 검사).
- **공통**: 두 빌더가 같은 `tableDocLabels`를 받아 같은 헤더 라벨을 낸다(언어 일관).
- **E2E**: 실 브라우저에서 Word/Excel 다운로드가 **비어있지 않은** `.docx`/`.xlsx`임. (기존 `export.spec.ts` 확장: Word 항목 추가, Excel은 그대로.)
- 검증 명령: `cd frontend && npx vitest run <files>`; 타입: `npx tsc --noEmit --composite false --incremental false -p tsconfig.app.json`(루트 `npm run type-check`는 사전부터 no-op); E2E: `VITE_PROXY_TARGET=http://localhost:4000 npx playwright test export --project=chromium --reporter=line`.

## 8. 위험 / 스파이크

- **exceljs가 Vite 워커/브라우저에서 동작하는지**: exceljs는 브라우저 사용 시 Node 의존(stream 등) 이슈가 날 수 있다. 작은 스파이크로 워커에서 `writeBuffer`가 되는지 확인하고, 안 되면 브라우저 dist(`exceljs/dist/exceljs.min.js`) import로 회피. 그래도 안 되면 `buildTableDocBlob`의 메인스레드 폴백이 받는다.
- **docx가 워커에서 `Packer.toBlob`** 동작 확인(브라우저 Blob API 사용 — 워커에서 가용). 안 되면 폴백.
- 두 위험 모두 기존 워커 실패→메인스레드 폴백 안전망이 있어 "다운로드 자체 실패"로는 이어지지 않는다.

## 9. 범위 밖 (YAGNI)

- 테이블별 개별 `headerColor` 반영, zebra 줄무늬, PDF 스타일 변경, 페이지 머리말/바닥글, 표지/목차.
