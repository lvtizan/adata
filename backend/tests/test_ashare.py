#!/usr/bin/env python3
"""ashare.py 单元测试"""
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import ashare


class AshareTests(unittest.TestCase):
    def test_get_falls_back_to_env_session_when_direct_session_fails(self):
        direct_error = requests.exceptions.ConnectionError("direct failed")
        direct_session = Mock()
        direct_session.get.side_effect = direct_error

        response = Mock()
        response.status_code = 200
        env_session = Mock()
        env_session.get.return_value = response

        with patch.object(ashare, "_SESSION", direct_session), patch.object(ashare, "_ENV_SESSION", env_session):
            result = ashare._get("http://example.com/data")

        self.assertIs(result, response)
        direct_session.get.assert_called_once()
        env_session.get.assert_called_once()

    def test_get_raises_last_error_when_both_sessions_fail(self):
        direct_session = Mock()
        env_session = Mock()
        direct_session.get.side_effect = requests.exceptions.Timeout("direct timeout")
        env_session.get.side_effect = requests.exceptions.ProxyError("proxy timeout")

        with patch.object(ashare, "_SESSION", direct_session), patch.object(ashare, "_ENV_SESSION", env_session):
            with self.assertRaises(requests.exceptions.ProxyError):
                ashare._get("http://example.com/data")


if __name__ == "__main__":
    unittest.main()
