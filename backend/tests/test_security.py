import pytest

from backend.security import (
    hash_pin,
    make_token,
    verify_pin,
    verify_token,
)


def test_hash_pin_returns_different_salts_for_same_pin():
    h1, s1 = hash_pin("1234")
    h2, s2 = hash_pin("1234")
    assert s1 != s2
    assert h1 != h2


def test_verify_pin_correct_and_wrong():
    pin_hash, salt = hash_pin("4821")
    assert verify_pin("4821", pin_hash, salt) is True
    assert verify_pin("4822", pin_hash, salt) is False


def test_hash_does_not_contain_plaintext_pin():
    pin_hash, _salt = hash_pin("1234")
    assert pin_hash != "1234"
    assert "1234" not in pin_hash


@pytest.mark.parametrize("bad", ["12a4", "123", "12345", "", "abcd"])
def test_hash_pin_rejects_invalid_pins(bad):
    with pytest.raises(ValueError, match="PIN must be exactly 4 digits"):
        hash_pin(bad)


def test_token_round_trip_returns_subject():
    token = make_token("student-42", "secret", now=1000)
    assert verify_token(token, "secret", now=1000) == "student-42"


def test_tampered_token_returns_none():
    token = make_token("student-42", "secret", now=1000)
    payload, sig = token.split(".")
    tampered_payload = ("A" if payload[0] != "A" else "B") + payload[1:]
    assert verify_token(f"{tampered_payload}.{sig}", "secret", now=1000) is None


def test_expired_token_returns_none():
    token = make_token("student-42", "secret", ttl_seconds=60, now=1000)
    assert verify_token(token, "secret", now=1000) == "student-42"
    assert verify_token(token, "secret", now=1061) is None


def test_wrong_secret_returns_none():
    token = make_token("student-42", "secret", now=1000)
    assert verify_token(token, "other-secret", now=1000) is None


def test_malformed_token_returns_none():
    assert verify_token("abc", "secret", now=1000) is None


def test_empty_secret_raises_value_error():
    with pytest.raises(ValueError):
        make_token("student-42", "", now=1000)
    with pytest.raises(ValueError):
        verify_token("abc.def", "", now=1000)
