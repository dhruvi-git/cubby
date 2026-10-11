"""AI providers. Everything AI goes through these small classes, so swapping
models or companies means changing settings, not code.

- Chat / generation: Gemini (primary) or Groq (backup), switchable.
- Embeddings: always Gemini. Vectors from different models can't be mixed,
  so the embedding model stays fixed even when the chat model changes.
"""
import json
import math
import re
from functools import lru_cache

import httpx

from ..config import get_settings


class AIUnavailable(RuntimeError):
    pass


def parse_json(text: str) -> dict:
    """Pull a JSON object out of a model reply (handles ```json fences)."""
    text = re.sub(r"```(?:json)?", "", text).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object in model reply")
    return json.loads(text[start:end + 1])


def _normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


class GeminiProvider:
    """Gemini through Google Cloud's Agent Platform (formerly Vertex AI)."""
    name = "gemini"
    label = "Gemini (Google Cloud Agent Platform)"

    def __init__(self) -> None:
        from google import genai
        s = get_settings()
        if not s.gcp_project_id:
            raise AIUnavailable("GCP_PROJECT_ID is missing in .env.")
        self.client = genai.Client(vertexai=True, project=s.gcp_project_id, location=s.gcp_location)
        self.model = s.gemini_model
        self.embed_model = s.gemini_embed_model
        self.dim = s.embed_dim

    def generate(self, system: str, prompt: str, json_mode: bool = False) -> str:
        from google.genai import types
        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json" if json_mode else "text/plain",
        )
        resp = self.client.models.generate_content(model=self.model, contents=prompt, config=config)
        return (resp.text or "").strip()

    def stream(self, system: str, prompt: str):
        from google.genai import types
        config = types.GenerateContentConfig(system_instruction=system)
        for chunk in self.client.models.generate_content_stream(model=self.model, contents=prompt, config=config):
            if chunk.text:
                yield chunk.text

    def embed(self, texts: list[str], kind: str = "document") -> list[list[float]]:
        from google.genai import types
        task = "RETRIEVAL_DOCUMENT" if kind == "document" else "RETRIEVAL_QUERY"
        out: list[list[float]] = []
        for i in range(0, len(texts), 50):
            batch = texts[i:i + 50]
            try:
                cfg = types.EmbedContentConfig(task_type=task, output_dimensionality=self.dim)
                resp = self.client.models.embed_content(model=self.embed_model, contents=batch, config=cfg)
            except Exception:
                # Some embedding models don't accept task_type; retry without it.
                cfg = types.EmbedContentConfig(output_dimensionality=self.dim)
                resp = self.client.models.embed_content(model=self.embed_model, contents=batch, config=cfg)
            out.extend(_normalize(list(e.values)) for e in resp.embeddings)
        return out


class GroqProvider:
    """Backup chat model via Groq's OpenAI-compatible API."""
    name = "groq"
    label = "Groq"

    URL = "https://api.groq.com/openai/v1/chat/completions"

    def __init__(self) -> None:
        s = get_settings()
        if not s.groq_api_key:
            raise AIUnavailable("GROQ_API_KEY is missing in .env.")
        self.key = s.groq_api_key
        self.model = s.groq_model

    def generate(self, system: str, prompt: str, json_mode: bool = False) -> str:
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            "temperature": 0.2,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        r = httpx.post(self.URL, json=body, timeout=60,
                       headers={"Authorization": f"Bearer {self.key}"})
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()

    def stream(self, system: str, prompt: str):
        body = {
            "model": self.model, "stream": True, "temperature": 0.2,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        }
        with httpx.stream("POST", self.URL, json=body, timeout=60,
                          headers={"Authorization": f"Bearer {self.key}"}) as r:
            r.raise_for_status()
            for line in r.iter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:].strip()
                if data == "[DONE]":
                    break
                delta = json.loads(data)["choices"][0].get("delta", {}).get("content")
                if delta:
                    yield delta


_CHAT = {"gemini": GeminiProvider, "groq": GroqProvider}


@lru_cache
def _provider(name: str):
    return _CHAT[name]()


class ChatModel:
    """Primary provider with automatic fallback to the other one."""

    def __init__(self) -> None:
        s = get_settings()
        self.order = [s.llm_provider] + ([n for n in _CHAT if n != s.llm_provider] if s.llm_fallback else [])
        self.last_used: str | None = None

    def generate(self, system: str, prompt: str, json_mode: bool = False) -> str:
        errors = []
        for name in self.order:
            try:
                text = _provider(name).generate(system, prompt, json_mode)
                self.last_used = name
                return text
            except Exception as exc:
                errors.append(f"{name}: {exc}")
                print(f"[ai] {name} failed: {exc}")
        raise AIUnavailable("No AI provider answered. " + " | ".join(errors))


    def stream(self, system: str, prompt: str):
        """Yields text pieces as they arrive. Falls back to the next provider only if
        the first one fails before producing anything."""
        errors = []
        for name in self.order:
            started = False
            try:
                provider = _provider(name)
                stream = getattr(provider, "stream", None)
                pieces = stream(system, prompt) if stream else iter([provider.generate(system, prompt)])
                for piece in pieces:
                    if not started:
                        self.last_used = name
                        started = True
                    yield piece
                return
            except Exception as exc:
                if started:
                    raise
                errors.append(f"{name}: {exc}")
                print(f"[ai] {name} stream failed: {exc}")
        raise AIUnavailable("No AI provider answered. " + " | ".join(errors))


def get_chat() -> ChatModel:
    return ChatModel()


def get_embedder() -> GeminiProvider:
    try:
        return _provider("gemini")
    except Exception as exc:
        raise AIUnavailable(f"Embeddings need Gemini on Google Cloud. {exc}") from exc
