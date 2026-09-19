"""El filtro global por periodo, con la precision que la fecha de cada documento de verdad tiene.

Solo una parte del corpus trae la fecha completa en su metadata; el resto sabe el ano y nada mas.
Un documento entra en el periodo cuando **todo** lo que se sabe de su fecha cae dentro: uno fechado
solo por ano entra si el periodo cubre ese ano entero. Asi el filtro nunca afirma que un documento
es de un mes que no consta, a costa de dejar fuera los que no se pueden situar con esa precision.
"""

from datetime import date

# Reglas de `document_dates.source` que dan el dia; las demas solo dan el ano.
PRECISE = ("iso_en_nombre", "aammdd_en_nombre")

# Ultimo dia que la fecha conocida del documento puede significar.
_PERIOD_END = (
    f"case when d.source in ({', '.join(repr(rule) for rule in PRECISE)}) then d.published_on "
    "else (date_trunc('year', d.published_on) + interval '1 year - 1 day')::date end"
)


def documents(
    doc_column: str, date_from: date | None, date_to: date | None, args: list[object]
) -> str:
    """Condicion SQL que deja solo los documentos cuya fecha conocida cae entera en el periodo.

    Devuelve una cadena vacia sin periodo, para concatenarla a un `where` sin mas.
    """
    if date_from is None and date_to is None:
        return ""
    bounds = []
    if date_from is not None:
        args.append(date_from)
        bounds.append(f"d.published_on >= ${len(args)}")
    if date_to is not None:
        args.append(date_to)
        bounds.append(f"{_PERIOD_END} <= ${len(args)}")
    return (
        f" and exists (select 1 from document_dates d where d.doc_id = {doc_column} "
        f"and {' and '.join(bounds)})"
    )


def issued(column: str, date_from: date | None, date_to: date | None, args: list[object]) -> str:
    """La misma condicion para las alertas, que traen su fecha de emision exacta."""
    condition = ""
    if date_from is not None:
        args.append(date_from)
        condition += f" and {column} >= ${len(args)}"
    if date_to is not None:
        args.append(date_to)
        condition += f" and {column} <= ${len(args)}"
    return condition
