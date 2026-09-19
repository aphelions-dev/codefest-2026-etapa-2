"""Como entra la pregunta al endpoint, y que pasa cuando algo se cae.

El Anexo A.4 pide que el endpoint reciba la pregunta «en texto plano o JSON» y la ficha declara
`text/plain` como modo de entrada. Lo que se comprueba aqui es que ninguna de las formas razonables
de mandar una pregunta acaba en un 422, porque durante la ventana de evaluacion un 422 es una
pregunta perdida y no hay reintento.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.agent.graph import INTERNAL_ERROR, OK
from app.api import chat as chat_api

QUESTION = "Que riesgos describe el corpus para la orbita baja terrestre?"


class FakeGraph:
    """El estado que devolveria el grafo, y la pregunta que de verdad le llego."""

    def __init__(self, error: Exception | None = None):
        self._error = error
        self.questions: list[str] = []

    async def ainvoke(self, state):
        self.questions.append(state["question"])
        if self._error is not None:
            raise self._error
        return {"answer": "respuesta", "status": OK}


def mount(graph: FakeGraph) -> TestClient:
    """El router de verdad, con el grafo sustituido: lo que se prueba es el endpoint."""
    app = FastAPI()
    app.include_router(chat_api.router)
    app.dependency_overrides[chat_api.get_agent] = lambda: (graph, None)
    return TestClient(app)


@pytest.fixture
def graph() -> FakeGraph:
    return FakeGraph()


@pytest.fixture
def client(graph: FakeGraph) -> TestClient:
    return mount(graph)


def test_el_json_canonico(client, graph):
    response = client.post("/chat", json={"input": QUESTION})

    assert response.status_code == 200
    assert graph.questions == [QUESTION]
    assert response.json()["evaluacion"]["input"] == QUESTION


def test_un_campo_de_mas_no_pierde_la_pregunta(client, graph):
    """Un arnes de evaluacion que anada su propio identificador de sesion sigue siendo legible."""
    response = client.post("/chat", json={"input": QUESTION, "session_id": "abc", "top_k": 5})

    assert response.status_code == 200
    assert graph.questions == [QUESTION]


@pytest.mark.parametrize(
    "field", ["input", "question", "query", "message", "text", "prompt", "pregunta", "consulta"]
)
def test_los_nombres_con_que_se_manda_una_pregunta(field, client, graph):
    response = client.post("/chat", json={field: QUESTION})

    assert response.status_code == 200
    assert graph.questions == [QUESTION]


def test_texto_plano_que_es_lo_que_declara_la_ficha(client, graph):
    response = client.post(
        "/chat", content=QUESTION.encode(), headers={"Content-Type": "text/plain"}
    )

    assert response.status_code == 200
    assert graph.questions == [QUESTION]


def test_una_cadena_json_desnuda(client, graph):
    response = client.post(
        "/chat", content=f'"{QUESTION}"'.encode(), headers={"Content-Type": "application/json"}
    )

    assert response.status_code == 200
    assert graph.questions == [QUESTION]


def test_el_cuerpo_vacio_se_rechaza(client, graph):
    """Lo unico que si es un error: no hay ninguna pregunta que atender."""
    assert client.post("/chat", content=b"").status_code == 422
    assert graph.questions == []


def test_un_json_sin_pregunta_dice_que_campos_espera(client, graph):
    response = client.post("/chat", json={"foo": "bar"})

    assert response.status_code == 422
    assert "input" in response.json()["detail"]
    assert graph.questions == []


def test_una_pregunta_que_pasa_del_limite(client, graph):
    assert client.post("/chat", json={"input": "a" * 4001}).status_code == 422
    assert graph.questions == []


def test_un_fallo_inesperado_responde_con_el_contrato():
    """Nunca un 500: la especificacion pide declarar el fallo en `estado`, no perder la respuesta."""
    client = mount(FakeGraph(error=RuntimeError("la base se cayo")))

    response = client.post("/chat", json={"input": QUESTION})

    assert response.status_code == 200
    body = response.json()
    assert body["metadata"]["estado"] == INTERNAL_ERROR
    assert body["evaluacion"]["input"] == QUESTION
    assert body["respuesta"] == body["evaluacion"]["actual_output"] != ""
    # No se filtra nada del fallo: el motivo queda en el log estructurado.
    assert "base" not in body["respuesta"]
