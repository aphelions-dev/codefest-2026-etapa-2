"""Logging estructurado, una linea JSON por evento.

Los campos que cada capa anade van en `extra` y salen al mismo nivel que el mensaje: es lo que
permite filtrar por agente o por estado sin parsear texto. Lo que bloqueo una consulta se audita
aqui, nunca en la respuesta que ve el usuario.
"""

import json
import logging
import sys

# Lo que trae un LogRecord de serie. Todo lo demas viene de `extra` y es lo que interesa emitir.
BUILTIN = set(
    logging.LogRecord("", 0, "", 0, "", (), None).__dict__
) | {"message", "asctime", "taskName"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "nivel": record.levelname.lower(),
            "origen": record.name,
            "mensaje": record.getMessage(),
        }
        entry.update({key: value for key, value in record.__dict__.items() if key not in BUILTIN})
        if record.exc_info:
            entry["error"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False, default=str)


def configure() -> None:
    """Se llama una vez al arrancar. Uvicorn ya dejo sus manejadores puestos: se reemplazan."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)
