from __future__ import annotations

import time

from schemaingest import security
from schemaingest.security import (
    generate_pairing_code,
    redact_password,
    set_pairing_code,
    validate_session,
    verify_pairing_code,
)


def test_pairing_code_is_six_digits():
    code = generate_pairing_code()
    assert len(code) == 6 and code.isdigit()


def test_correct_code_issues_a_valid_session():
    set_pairing_code("123456")
    token = verify_pairing_code(" 123456 ")
    assert token is not None
    assert validate_session(token)


def test_wrong_code_is_rejected():
    set_pairing_code("123456")
    assert verify_pairing_code("654321") is None


def test_nothing_pairs_when_no_code_is_set():
    set_pairing_code("")
    assert verify_pairing_code("") is None


def test_expired_session_is_rejected_and_dropped():
    set_pairing_code("123456")
    token = verify_pairing_code("123456")
    security._sessions[token] = time.time() - 1
    assert not validate_session(token)
    assert token not in security._sessions


def test_unknown_session_is_rejected():
    assert not validate_session("nope")


def test_redacts_uri_password():
    assert redact_password("postgresql://bob:s3cret@localhost/db") == "postgresql://bob:***@localhost/db"


def test_redacts_keyword_password():
    assert redact_password("host=x password=s3cret user=bob") == "host=x password=*** user=bob"


def test_leaves_text_without_password_alone():
    assert redact_password("could not connect to server") == "could not connect to server"
