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

    @property
    def origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
