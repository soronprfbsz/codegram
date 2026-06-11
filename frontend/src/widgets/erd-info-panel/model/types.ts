/** Semantic group-mutation callbacks the page wires to entities/dbml groupOps. */
export interface GroupOpHandlers {
  onCreateGroup: (name: string) => void
  onRenameGroup: (oldName: string, newName: string) => void
  onDeleteGroup: (name: string) => void
  onSetGroupColor: (name: string, color: string | null) => void
  /** toGroup === null → Ungrouped로 이동(그룹에서 제거) */
  onMoveTable: (tableId: string, toGroup: string | null) => void
}
