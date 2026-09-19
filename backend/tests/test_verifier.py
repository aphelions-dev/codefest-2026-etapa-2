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
    assert verifier.cited("Algo [F1-CSET-065] y algo [F2-UNOOSA-005].", [fragment("F1-CSET-065", "a"), fragment("F2-UNOOSA-005", "b")]) == {
        "F1-CSET-065",
        "F2-UNOOSA-005",
    }


async def test_acepta_la_cita_con_guion_no_separable():
    """Medido contra gpt-oss-120b: escribe U+2011, y sin normalizar no se extrae ninguna cita."""
    client = FakeClient({"verifier": [verdict(True)]})
    fragments = [fragment("F2-SWF-078", "texto")]

    ok, _, _, _ = await verifier.verify(
        client, "fast-test", "Una afirmacion [F2\u2011SWF\u2011078].", fragments
    )

    assert verifier.cited("[F2\u2011SWF\u2011078]", [fragment("F2-SWF-078", "texto")]) == {"F2-SWF-078"}
    assert ok is True


async def test_acepta_la_cita_del_fragmento():
    """El redactor cita a veces el chunk; sigue siendo verificable porque estaba en la evidencia."""
    client = FakeClient({"verifier": [verdict(True)]})
    fragments = [fragment("F2-SWF-078", "texto")]

    ok, reason, _, _ = await verifier.verify(
        client, "fast-test", "Una afirmacion [F2-SWF-078-chunk-0000].", fragments
    )

    assert ok is True, reason


async def test_la_cita_inventada_sigue_cayendo():
    """El arreglo no puede volverse una puerta abierta: lo que no se recupero, se rechaza."""
    fragments = [fragment("F2-SWF-078", "texto")]

    assert verifier.untraceable("Algo [F9\u2011FALSO\u2011001].", fragments) == {"F9-FALSO-001"}
    # Un numero de fragmento equivocado sobre un documento que si se recupero no es
    # fabricacion: es una errata. Si fuera la unica cita, "sin citas" la rechaza igual.
    assert verifier.untraceable("Algo [F2-SWF-078-chunk-9999].", fragments) == set()


def test_extrae_la_cita_con_espacios_dentro():
    assert verifier.cited("Algo [ F1-CSET-065 ].", [fragment("F1-CSET-065", "texto")]) == {"F1-CSET-065"}


async def test_acepta_la_cita_con_corchetes_japoneses():
    """Medido en produccion: gpt-oss-120b escribe U+3010 y U+3011 en vez de corchetes ASCII."""
    client = FakeClient({"verifier": [verdict(True)]})
    fragments = [fragment("F2-SWF-043", "texto")]

    ok, reason, _, _ = await verifier.verify(
        client, "fast-test", "Una afirmacion 【F2-SWF-043】.", fragments
    )

    assert verifier.cited("【F2-SWF-043】", fragments) == {"F2-SWF-043"}
    assert ok is True, reason


async def test_una_respuesta_sin_citas_se_rechaza():
    """El conjunto vacio dejaba de ser un aprobado: es la senal de que la extraccion esta ciega."""
    client = FakeClient({})
    fragments = [fragment("F2-SWF-043", "texto")]

    ok, reason, usage, tools = await verifier.verify(
        client, "fast-test", "Una afirmacion sin ninguna cita.", fragments
    )

    assert ok is False
    assert "no cita" in reason
    # Ni una llamada a modelo: la comprobacion es de codigo.
    assert usage == [] and client.calls == []
    assert tools[0].output == "la respuesta no cita ninguna fuente"


async def test_sin_evidencia_no_se_exige_cita():
    """Cuando no hubo recuperacion no hay nada que citar, y exigirlo seria un bucle."""
    client = FakeClient({"verifier": [verdict(True)]})

    ok, reason, _, _ = await verifier.verify(client, "fast-test", "No hay evidencia.", [])

    assert ok is True, reason
