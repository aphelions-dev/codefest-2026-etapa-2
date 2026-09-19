"""Configuracion por variables de entorno. Sin credenciales en el codigo: es calificable."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    database_url: str = ""
    # Proxy LiteLLM de la organizacion, compatible con OpenAI.
    litellm_base_url: str = ""
    litellm_api_key: str = ""
    # Todo lo que no sea redactar va al modelo barato: el presupuesto es en dinero.
    fast_model: str = "openai/gpt-oss-20b"
    deep_model: str = "openai/gpt-oss-120b"
    cors_origins: str = "http://localhost:3000"
    # Lo que declara la ficha: tiene que coincidir con el subdominio del agente en Coolify.
    agent_endpoint: str = "http://localhost:8000/chat"
    # Proveedor de los modelos, tal como se declara en la ficha.
    provider: str = "openai"
    # Sin indice cargado el agente de corpus no puede responder; el resto del servicio si.
    load_index: bool = True

    @property
    def origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
