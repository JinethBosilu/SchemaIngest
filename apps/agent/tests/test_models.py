from __future__ import annotations

import ssl

import psycopg2.extensions
import pytest

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
    assert ConnectRequest().resolved_schema() == "public"
    assert ConnectRequest.model_validate({"schema": "sales"}).schema_ == "sales"


# ─── Engines ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("conn, engine", [
    ("mysql://u@h/db", "mysql"),
    ("MariaDB://u@h/db", "mysql"),
    ("postgresql://u@h/db", "postgresql"),
    ("postgres://u@h/db", "postgresql"),
    ("host=h dbname=db", "postgresql"),
    (None, "postgresql"),
])
def test_engine_is_read_from_the_scheme(conn, engine):
    assert ConnectRequest(connectionString=conn).resolved_engine() == engine


def test_explicit_engine_wins():
    assert ConnectRequest(engine="mysql", dbname="x").resolved_engine() == "mysql"
    assert ConnectRequest(engine="postgresql", connectionString="mysql://u@h/d").resolved_engine() == "postgresql"


def test_schema_defaults_per_engine():
    assert ConnectRequest(connectionString="postgresql://u@h/d").resolved_schema() == "public"
    assert ConnectRequest(connectionString="mysql://u@h/shop").resolved_schema() == "shop"
    assert ConnectRequest(engine="mysql", dbname="shop").resolved_schema() == "shop"
    assert ConnectRequest(connectionString="mysql://u@h/shop", schema="other").resolved_schema() == "other"


# ─── MySQL connection parameters ─────────────────────────────────────

def test_mysql_url_is_decoded():
    params = ConnectRequest(connectionString="mysql://b%40b:p%40ss%3Aw@db.local:3307/shop").to_mysql_params()
    assert params == {"host": "db.local", "port": 3307, "user": "b@b", "password": "p@ss:w", "database": "shop"}


def test_mysql_defaults_host_and_port():
    params = ConnectRequest(connectionString="mysql://root@/shop").to_mysql_params()
    assert params == {"host": "localhost", "port": 3306, "user": "root", "database": "shop"}


def test_mysql_fields():
    req = ConnectRequest(engine="mysql", host="h", dbname="shop", user="u", password="it's a pass")
    assert req.to_mysql_params() == {
        "host": "h", "port": 3306, "user": "u", "password": "it's a pass", "database": "shop",
    }


def test_mysql_needs_a_database():
    with pytest.raises(ValueError, match="Put the database"):
        ConnectRequest(connectionString="mysql://root@localhost/").to_mysql_params()


@pytest.mark.parametrize("mode", ["DISABLED", "preferred"])
def test_mysql_ssl_off(mode):
    assert "ssl" not in ConnectRequest(connectionString=f"mysql://u@h/d?ssl-mode={mode}").to_mysql_params()


def test_mysql_ssl_required_encrypts_without_verifying():
    assert ConnectRequest(connectionString="mysql://u@h/d?ssl-mode=REQUIRED").to_mysql_params()["ssl"] == {}


def test_mysql_ssl_verify_identity_checks_the_certificate():
    ctx = ConnectRequest(connectionString="mysql://u@h/d?ssl_mode=VERIFY_IDENTITY").to_mysql_params()["ssl"]
    assert isinstance(ctx, ssl.SSLContext)
    assert ctx.check_hostname and ctx.verify_mode == ssl.CERT_REQUIRED


def test_mysql_rejects_unknown_options():
    with pytest.raises(ValueError, match="charset"):
        ConnectRequest(connectionString="mysql://u@h/d?charset=latin1").to_mysql_params()
    with pytest.raises(ValueError, match="ssl-mode must be"):
        ConnectRequest(connectionString="mysql://u@h/d?ssl-mode=maybe").to_mysql_params()
