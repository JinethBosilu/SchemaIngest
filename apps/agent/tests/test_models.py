from __future__ import annotations

import psycopg2.extensions

from schemaingest.models import ConnectRequest


def test_connection_string_wins():
    req = ConnectRequest(connectionString="postgresql://a@b/c", host="ignored")
    assert req.to_dsn() == "postgresql://a@b/c"


def test_fields_build_a_dsn():
    req = ConnectRequest(host="localhost", port=5433, dbname="shop", user="bob", password="pw")
    assert psycopg2.extensions.parse_dsn(req.to_dsn()) == {
        "host": "localhost", "port": "5433", "dbname": "shop", "user": "bob", "password": "pw",
    }


def test_password_with_spaces_and_quotes_survives():
    req = ConnectRequest(dbname="shop", password="it's a pass")
    assert psycopg2.extensions.parse_dsn(req.to_dsn())["password"] == "it's a pass"


def test_schema_defaults_to_public_and_reads_alias():
    assert ConnectRequest().schema_ == "public"
    assert ConnectRequest.model_validate({"schema": "sales"}).schema_ == "sales"
