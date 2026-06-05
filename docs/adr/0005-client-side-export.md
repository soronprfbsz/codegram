# 모든 출력(다이어그램·정의서)은 클라이언트 사이드에서 생성한다

다이어그램 이미지(PNG/SVG)와 PDF, 테이블 정의서(인앱 HTML 뷰 + Excel .xlsx + PDF)를 모두 브라우저에서 생성한다. 다이어그램은 React Flow 뷰포트를 html-to-image로 PNG/SVG화하고 PDF는 jsPDF/브라우저 인쇄로 만든다. 정의서는 파싱 모델로부터 HTML 표를 렌더링하고 SheetJS로 .xlsx를, 인쇄/jsPDF로 PDF를 만든다. FastAPI는 출력 생성에 관여하지 않는다.

## Considered Options

- **전부 클라이언트 (채택)**: 브라우저에 이미 파싱·렌더된 모델이 있으므로 가장 단순하고 백엔드가 얇게 유지됨(ADR-0002 일관).
- **정의서만 서버 생성 (기각)**: WeasyPrint/openpyxl로 고품질 PDF/Excel 가능하나 백엔드에 파싱 모델 전송·생성 로직 추가 필요.
- **전부 서버(헤드리스) (기각)**: 일관성↑이나 헤드리스 브라우저 운영 부담으로 과도.

## Consequences

- 매우 큰 ERD에서 클라이언트 PNG/PDF 렌더 성능·해상도 한계가 있을 수 있음 → 필요 시 정의서 고품질 출력만 서버 생성으로 승격 가능.
- 한국 실무 수요가 큰 Excel(.xlsx)은 SheetJS로 클라이언트 생성한다.
