/** Semantic group-mutation callbacks the page wires to entities/dbml groupOps. */
export interface GroupOpHandlers {
  onCreateGroup: (name: string) => void
  onRenameGroup: (oldName: string, newName: string) => void
  onDeleteGroup: (name: string) => void
  onSetGroupColor: (name: string, color: string | null) => void
  /** toGroup === null → Ungrouped로 이동(그룹에서 제거) */
  onMoveTable: (tableId: string, toGroup: string | null) => void
  /** 여러 테이블을 한 번에 이동(toGroup === null → Ungrouped). */
  onMoveTables: (tableIds: string[], toGroup: string | null) => void
  /** 새 그룹을 만들고 선택 테이블을 그 그룹으로 한 번에 이동. */
  onMoveTablesToNewGroup: (tableIds: string[], newName: string) => void
}
