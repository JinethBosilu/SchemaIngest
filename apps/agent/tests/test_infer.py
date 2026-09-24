from __future__ import annotations

from schemaingest.infer import infer_relationships
from schemaingest.models import ColumnInfo, Relationship, TableInfo


def _table(name: str, cols: dict[str, str], pk: list[str] | None = None) -> TableInfo:
    return TableInfo(
        name=name,
        schema="s",
        columns=[ColumnInfo(name=c, type=t, nullable=True) for c, t in cols.items()],
        primaryKey=pk if pk is not None else ["id"],
    )


def _links(tables, declared=()):
    return {(r.fromTable, r.fromColumn, r.toTable, r.toColumn)
            for r in infer_relationships(tables, list(declared))}


def test_stem_plural_and_trailing_words():
    tables = [
        _table("users", {"id": "int"}),
        _table("categories", {"id": "int"}),
        _table("addresses", {"id": "bigint"}),
        _table("boxes", {"id": "int"}),
        _table("orders", {
            "id": "int", "user_id": "int(11)", "category_id": "int",
            "shipping_address_id": "int unsigned", "box_id": "int",
        }),
    ]
    assert _links(tables) == {
        ("orders", "user_id", "users", "id"),
        ("orders", "category_id", "categories", "id"),
        ("orders", "shipping_address_id", "addresses", "id"),
        ("orders", "box_id", "boxes", "id"),
    }


def test_singular_table_name_and_camel_case():
    tables = [_table("person", {"id": "integer"}), _table("pets", {"id": "integer", "personId": "integer"})]
    assert _links(tables) == {("pets", "personId", "person", "id")}


def test_every_inferred_link_is_marked_and_keyed_by_column():
    tables = [_table("users", {"id": "int"}), _table("posts", {"id": "int", "user_id": "int"})]
    [r] = infer_relationships(tables, [])
    assert r.inferred is True
    assert r.constraintName == "inferred:user_id"


def test_parent_id_means_the_table_itself():
    tables = [_table("categories", {"id": "int", "parent_id": "int"})]
    assert _links(tables) == {("categories", "parent_id", "categories", "id")}


def test_parent_table_wins_over_self():
    tables = [_table("parents", {"id": "int"}), _table("kids", {"id": "int", "parent_id": "int"})]
    assert _links(tables) == {("kids", "parent_id", "parents", "id")}


def test_table_names_match_case_insensitively():
    tables = [_table("Users", {"ID": "int"}, pk=["ID"]), _table("Posts", {"ID": "int", "USER_ID": "int"}, pk=["ID"])]
    assert _links(tables) == {("Posts", "USER_ID", "Users", "ID")}


def test_type_mismatch_is_not_linked():
    tables = [_table("users", {"id": "uuid"}), _table("posts", {"id": "int", "user_id": "int"})]
    assert _links(tables) == set()


def test_text_keys_link_across_text_types():
    tables = [_table("sessions", {"id": "uuid"}), _table("events", {"id": "int", "session_id": "char(36)"})]
    assert _links(tables) == {("events", "session_id", "sessions", "id")}


def test_no_target_table_or_composite_target_key():
    tables = [
        _table("orders", {"region": "text", "id": "int"}, pk=["region", "id"]),
        _table("lines", {"id": "int", "order_id": "int", "external_id": "int"}),
    ]
    assert _links(tables) == set()


def test_declared_keys_are_not_repeated():
    tables = [_table("users", {"id": "int"}), _table("posts", {"id": "int", "user_id": "int"})]
    declared = [Relationship(fromTable="posts", fromColumn="user_id", toTable="users",
                             toColumn="id", constraintName="posts_user_fkey")]
    assert _links(tables, declared) == set()


def test_own_primary_key_is_not_a_link_but_a_composite_key_part_is():
    tables = [
        _table("users", {"id": "int", "user_id": "int"}, pk=["user_id"]),
        _table("products", {"id": "int"}),
        _table("wishlists", {"user_id": "int", "product_id": "int"}, pk=["user_id", "product_id"]),
    ]
    assert _links(tables) == {
        ("wishlists", "user_id", "users", "user_id"),
        ("wishlists", "product_id", "products", "id"),
    }


def test_plain_id_and_lookalikes_are_ignored():
    tables = [_table("users", {"id": "int"}), _table("t", {"id": "int", "userid": "int", "paid": "int"})]
    assert _links(tables) == set()
