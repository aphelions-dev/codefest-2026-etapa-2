"""El verificador. La trazabilidad se comprueba en codigo, asi que se puede comprobar sin modelo."""

from app.agent import verifier
from tests.conftest import FakeClient, fragment, verdict


async def test_rechaza_una_cita_inventada_sin_gastar_modelo():
    """Comparar dos conjuntos no necesita un modelo, y preguntarselo costaria tokens."""
    client = FakeClient({})
    fragments = [fragment("F2-CSIS-100", "texto")]

    ok, reason, usage, tools = await verifier.verify(
        client, "fast-test", "Una afirmacion [F9-FALSO-001].", fragments
    )

    assert ok is False
    assert "F9-FALSO-001" in reason
    assert usage == []
    assert client.calls == []
    assert [tool.name for tool in tools] == ["validate_traceability"]


async def test_acepta_la_respuesta_fiel():
    client = FakeClient({"verifier": [verdict(True)]})
    fragments = [fragment("F2-CSIS-100", "texto")]

    ok, _, usage, tools = await verifier.verify(
        client, "fast-test", "Una afirmacion [F2-CSIS-100].", fragments
    )

    assert ok is True
    assert len(usage) == 1
    assert [tool.name for tool in tools] == [
        "validate_traceability",
        "validate_faithfulness",
        "detect_injection",
    ]


async def test_rechaza_lo_que_la_evidencia_no_sostiene():
    client = FakeClient({"verifier": [verdict(False, "la evidencia no menciona esa cifra")]})
    fragments = [fragment("F2-CSIS-100", "texto")]

    ok, reason, _, _ = await verifier.verify(
        client, "fast-test", "El 73% de algo [F2-CSIS-100].", fragments
    )

    assert ok is False
    assert reason == "la evidencia no menciona esa cifra"


def test_extrae_las_citas():
    assert verifier.cited("Algo [F1-CSET-065] y algo [F2-UNOOSA-005].") == {
        "F1-CSET-065",
        "F2-UNOOSA-005",
    }
