"""Dobles de las dos fronteras externas: el proxy de modelos y el indice.

Se mockean esas dos y nada mas. El grafo, los guardianes y el verificador corren de verdad: si se
mockearan tambien, el test comprobaria que los mocks se llaman entre si.
"""

import json

import pytest

from app.agent.retrieval import Fragment
from app.agent.state import ToolRecord, Usage
from app.config import Settings


class FakeClient:
    """Devuelve la respuesta preparada para cada agente y cuenta lo que se le pidio."""

    def __init__(self, replies: dict[str, list[str]]):
        # Por agente, en orden: la segunda llamada al orquestador es la descomposicion.
        self._replies = {agent: list(texts) for agent, texts in replies.items()}
        self.calls: list[tuple[str, str]] = []

    async def complete(self, *, agent, model, system, user, json_schema=None):
        self.calls.append((agent, user))
        pending = self._replies.get(agent)
        if not pending:
            raise AssertionError(f"llamada inesperada al agente {agent}")
        text = pending.pop(0)
        # Tokens fijos y distintos por capa: hacen comprobable que la suma es de todas.
        return text, Usage(agent=agent, model=model, input=10, output=5)


class FakeRetriever:
    def __init__(self, fragments: list[Fragment]):
        self._fragments = fragments
        self.queries: list[list[str]] = []

    async def search(self, queries, phenomenon=None):
        self.queries.append(list(queries))
        return list(self._fragments)


class FakeVisualizer:
    """Devuelve los componentes preparados y anota cuantas veces se le pidio planificar."""

    def __init__(self, components: list[ToolRecord] | None = None):
        self._components = components or []
        self.questions: list[str] = []

    async def plan(self, question: str):
        self.questions.append(question)
        if not self._components:
            return [], []
        return list(self._components), [Usage(agent="visualizer", model="fast-test", input=10, output=5)]


def component(name: str = "get_places", **filters) -> ToolRecord:
    return ToolRecord(
        name=name,
        input_parameters=filters or {"level": "department", "phenomenon": 3},
        output="encabezan: Putumayo (12), Narino (9)",
    )


def fragment(doc_id: str, text: str, similarity: float = 0.8) -> Fragment:
    return Fragment(
        # El formato real del corpus: el chunk_id es el doc_id mas su posicion.
        chunk_id=f"{doc_id}-chunk-0000",
        doc_id=doc_id,
        source_file=f"{doc_id}.pdf",
        phenomenon=2,
        language="es",
        observatory="CSIS",
        position=0,
        text=text,
        similarity=similarity,
    )


@pytest.fixture
def settings() -> Settings:
    return Settings(
        database_url="postgresql://test",
        litellm_base_url="https://proxy.test/v1",
        litellm_api_key="test",
        fast_model="fast-test",
        deep_model="deep-test",
    )


def decompose(queries: list[str], phenomenon=None, route: str = "text") -> str:
    """Lo que devuelve el orquestador: las formulaciones, el fenomeno y a quien enruta."""
    return json.dumps({"queries": queries, "phenomenon": phenomenon, "route": route})


def attack(is_attack: bool, reason: str = "") -> str:
    return json.dumps({"attack": is_attack, "reason": reason})


def verdict(ok: bool, reason: str = "") -> str:
    return json.dumps({"ok": ok, "reason": reason})


def safe(is_safe: bool, reason: str = "") -> str:
    return json.dumps({"safe": is_safe, "reason": reason})
