import json
import sys
from pathlib import Path
from unittest.mock import Mock

import pytest
import requests

sys.path.insert(0, str(Path("scripts").resolve()))
from analyze_with_deepseek import DeepSeekClient, ANALYSIS_PROMPT_VERSION, abstract_hash, prompt_for_paper, should_analyze

PAPER = {"title": "Speech in noise", "abstract": "Forty listeners completed a speech in noise test. The intervention improved speech recognition scores. " * 3}
VALUE = {"scientific_question": "Question", "key_highlight": "Reported result", "main_limitation": "Not stated", "research_implication": "Possible implication", "evidence": ["Forty listeners completed a speech in noise test."]}


def response(value=VALUE, code=200):
    result = Mock(status_code=code)
    result.json.return_value = {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(value)}}]}
    if code >= 400:
        result.raise_for_status.side_effect = requests.HTTPError(response=result)
    return result


def test_deepseek_request_uses_json_mode_and_disabled_thinking():
    client = DeepSeekClient("dummy-test-key")
    client.session.post = Mock(return_value=response())
    assert client.analyze(PAPER)["evidence"] == VALUE["evidence"]
    args, kwargs = client.session.post.call_args
    assert args[0] == "https://api.deepseek.com/chat/completions"
    assert kwargs["json"]["response_format"] == {"type": "json_object"}
    assert kwargs["json"]["thinking"] == {"type": "disabled"}
    assert "generic sample-size" in kwargs["json"]["messages"][1]["content"]


def test_analysis_cache_tracks_abstract_and_provider():
    paper = dict(PAPER)
    paper["ai_analysis"] = {**VALUE, "provider": "deepseek", "prompt_version": ANALYSIS_PROMPT_VERSION, "abstract_hash": abstract_hash(paper)}
    assert not should_analyze(paper)
    paper["abstract"] += " New evidence."
    assert should_analyze(paper)
    paper["ai_analysis"]["abstract_hash"] = abstract_hash(paper)
    paper["ai_analysis"]["provider"] = "minimax"
    assert should_analyze(paper)


def test_fabricated_evidence_is_rejected(monkeypatch):
    monkeypatch.setattr("analyze_with_deepseek.time.sleep", lambda _: None)
    client = DeepSeekClient("dummy-test-key")
    client.session.post = Mock(return_value=response({**VALUE, "evidence": ["One thousand participants were enrolled"]}))
    with pytest.raises(ValueError, match="exact abstract quote"):
        client.analyze(PAPER)


def test_auth_error_is_not_retried():
    client = DeepSeekClient("dummy-test-key")
    client.session.post = Mock(return_value=response(code=401))
    with pytest.raises(requests.HTTPError):
        client.analyze(PAPER)
    assert client.session.post.call_count == 1


def test_transient_error_is_retried(monkeypatch):
    monkeypatch.setattr("analyze_with_deepseek.time.sleep", lambda _: None)
    client = DeepSeekClient("dummy-test-key")
    client.session.post = Mock(side_effect=[response(code=429), response()])
    assert client.analyze(PAPER)["key_highlight"] == VALUE["key_highlight"]
    assert client.session.post.call_count == 2


def test_prompt_does_not_force_generic_weaknesses():
    prompt = prompt_for_paper(PAPER, "zh")
    assert "摘要未明确报告局限" in prompt
    assert "Limited generalizability due to small" not in prompt
