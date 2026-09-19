"""Cliente del proxy LiteLLM, compatible con OpenAI.

Se habla HTTP directamente en vez de montar el SDK: lo unico que se necesita de el es
`POST /chat/completions` y el bloque `usage` que devuelve, y cada dependencia mas es superficie que
hay que fijar y auditar.

`max_tokens` no se ajusta nunca. Los modelos gpt-oss razonan antes de responder y el razonamiento
cuenta como salida: con el margen justo se gasta el presupuesto razonando y no se emite nada.
"""

import json
import logging
import time
from typing import Any

import httpx

from app.agent.state import Usage
from app.config import Settings

log = logging.getLogger("agent.llm")

# Recorta en torno al 35% la salida del modelo pequeno sin perder la llamada a herramienta.
REASONING_EFFORT = "low"


class ModelError(RuntimeError):
    """El proxy no respondio o respondio algo que no se puede usar."""


class Client:
    """Una instancia por proceso: reutiliza la conexion con el proxy."""

    def __init__(self, http: httpx.AsyncClient, settings: Settings):
        self._http = http
        self._settings = settings

    @classmethod
    def open(cls, settings: Settings) -> "Client":
        http = httpx.AsyncClient(
            base_url=settings.litellm_base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {settings.litellm_api_key}"},
            timeout=httpx.Timeout(90.0, connect=10.0),
        )
        return cls(http, settings)

    async def close(self) -> None:
        await self._http.aclose()

    async def models(self) -> list[str]:
        """Los identificadores que expone el proxy. Es lo que confirma `fast_model` y `deep_model`."""
        response = await self._http.get("/models")
        response.raise_for_status()
        return [entry["id"] for entry in response.json().get("data", [])]

    async def complete(
        self,
        *,
        agent: str,
        model: str,
        system: str,
        user: str,
        json_schema: dict[str, Any] | None = None,
    ) -> tuple[str, Usage]:
        """Una llamada, un `Usage`. Devolverlos juntos es lo que hace imposible perder el gasto."""
        payload: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "reasoning_effort": REASONING_EFFORT,
        }
        if json_schema is not None:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "respuesta", "schema": json_schema, "strict": True},
            }

        started = time.perf_counter()
        try:
            response = await self._http.post("/chat/completions", json=payload)
            response.raise_for_status()
            body = response.json()
        except httpx.HTTPError as error:
            raise ModelError(f"{agent}: el proxy no respondio") from error

        try:
            text = body["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError) as error:
            raise ModelError(f"{agent}: respuesta del proxy sin contenido") from error

        raw = body.get("usage") or {}
        usage = Usage(
            agent=agent,
            model=model,
            input=int(raw.get("prompt_tokens", 0)),
            output=int(raw.get("completion_tokens", 0)),
        )
        log.info(
            "llamada a modelo",
            extra={
                "agente": agent,
                "modelo": model,
                "tokens_input": usage.input,
                "tokens_output": usage.output,
                "latencia_ms": int((time.perf_counter() - started) * 1000),
            },
        )
        return text.strip(), usage


def parse_json(text: str, fallback: dict[str, Any]) -> dict[str, Any]:
    """Lo que devuelve el modelo, o el fallback.

    Un guardian que revienta porque el modelo dijo algo raro deja de ser un guardian, asi que el
    fallback de cada llamada es siempre la decision conservadora de esa capa.
    """
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        log.warning("respuesta no parseable, se aplica el fallback", extra={"texto": text[:200]})
        return fallback
    return value if isinstance(value, dict) else fallback
