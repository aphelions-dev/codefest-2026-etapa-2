"""La validacion del visualizador: lo que devuelve el modelo no se obedece, se comprueba.

Lo que importa aqui es que nada de lo que el modelo escriba pueda colarse sin existir: ni una
herramienta, ni un campo de una lista cerrada, ni una entidad, ni un territorio. El resaltado del
mapa es el caso nuevo: el modelo escribe el toponimo y el codigo lo resuelve contra la tabla.
"""

from app.agent.visualizer import _normalizado, _validated

ENTITIES = {"clan-del-golfo": "Clan del Golfo"}
# Nombre normalizado -> (place_id, nombre), tal como lo arma `Visualizer._places`.
PLACES = {
    "putumayo": ("CO-PUT", "Putumayo"),
    "co-put": ("CO-PUT", "Putumayo"),
    "narino": ("CO-NAR", "Nariño"),
    "colombia": ("CO", "Colombia"),
}


def componente(**campos):
    """Un componente como lo devuelve el modelo: todos los campos, la mayoria en null."""
    base = {
        "tool": "get_places", "phenomenon": None, "level": None, "view": None, "by": None,
        "cols": None, "measure": None, "entity": None, "place": None,
        "date_from": None, "date_to": None,
    }
    return {**base, **campos}


def test_el_toponimo_se_resuelve_a_su_identificador():
    parametros = _validated(componente(place="Putumayo"), ENTITIES, PLACES)

    assert parametros["place"] == "CO-PUT"
    # El nombre viaja tambien: es lo que el redactor escribe y lo que el mapa rotula.
    assert parametros["place_name"] == "Putumayo"


def test_el_toponimo_se_resuelve_sin_acentos_ni_mayusculas():
    assert _validated(componente(place="NARIÑO"), ENTITIES, PLACES)["place"] == "CO-NAR"


def test_un_territorio_que_no_existe_se_descarta():
    """No se obedece lo que el modelo invente: sin lugar, el mapa no resalta nada."""
    parametros = _validated(componente(place="Wakanda"), ENTITIES, PLACES)

    assert "place" not in parametros and "place_name" not in parametros


def test_el_resaltado_solo_aplica_al_mapa():
    """`place` en otro componente no significa nada, asi que no viaja."""
    parametros = _validated(
        componente(tool="get_timeline", place="Putumayo"), ENTITIES, PLACES
    )

    assert "place" not in parametros


def test_una_herramienta_inventada_se_descarta():
    assert _validated(componente(tool="borrar_todo"), ENTITIES, PLACES) is None


def test_una_entidad_que_no_existe_se_descarta():
    assert "entity" not in _validated(componente(entity="inventada"), ENTITIES, PLACES)


def test_las_alertas_y_los_grupos_fijan_el_fenomeno_tres():
    """Solo existen en el fenomeno 3: verlas con otro filtro seria una cifra bajo otra etiqueta."""
    parametros = _validated(componente(view="alertas", phenomenon=1), ENTITIES, PLACES)

    assert parametros["view"] == "alertas" and parametros["phenomenon"] == 3


def test_un_periodo_mal_escrito_se_descarta():
    parametros = _validated(
        componente(date_from="ayer", date_to="2025-03"), ENTITIES, PLACES
    )

    assert "date_from" not in parametros and parametros["date_to"] == "2025-03"


def test_normalizado():
    assert _normalizado("  Nariño   ") == "narino"
    assert _normalizado("Bogotá D.C.") == "bogota d.c."
