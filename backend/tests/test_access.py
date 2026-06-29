"""Unit tests for the role/capability policy (services.access)."""
from app.services.access import EDITOR, OWNER, VIEWER, Capability, can


def test_owner_can_do_everything() -> None:
    assert all(can(OWNER, cap) for cap in Capability)


def test_editor_can_view_edit_and_create_snapshot() -> None:
    assert can(EDITOR, Capability.VIEW)
    assert can(EDITOR, Capability.EDIT)
    assert can(EDITOR, Capability.CREATE_SNAPSHOT)


def test_editor_cannot_manage_members_delete_project_or_snapshot() -> None:
    assert not can(EDITOR, Capability.MANAGE_MEMBERS)
    assert not can(EDITOR, Capability.DELETE_PROJECT)
    assert not can(EDITOR, Capability.DELETE_SNAPSHOT)


def test_viewer_can_only_view() -> None:
    assert can(VIEWER, Capability.VIEW)
    assert not can(VIEWER, Capability.EDIT)
    assert not can(VIEWER, Capability.CREATE_SNAPSHOT)
    assert not can(VIEWER, Capability.DELETE_SNAPSHOT)
    assert not can(VIEWER, Capability.MANAGE_MEMBERS)
    assert not can(VIEWER, Capability.DELETE_PROJECT)
