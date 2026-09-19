"""Configuracion por variables de entorno. Sin credenciales en el codigo: es calificable."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    database_url: str = ""
    # Proxy LiteLLM de la organizacion, compatible con OpenAI.
    litellm_base_url: str = ""
    litellm_api_key: str = ""
    # Los identificadores exactos los expone `GET /v1/models` del proxy y cambian entre entornos:
    # el gateway local mapea `fast` y `deep` a otro proveedor para no gastar la bolsa del reto. Sin
    # valor por defecto para que un despliegue mal configurado falle al arrancar y no en la demo.
    # Todo lo que no sea redactar va al modelo barato: el presupuesto es en dinero.
    fast_model: str = ""
    deep_model: str = ""
    cors_origins: str = "http://localhost:3000"

    # Recuperacion. Politica medida en la Etapa 1 (NDCG@10 0,7329) y portada tal cual.
    # Con el valor por defecto de pgvector (40) la lista difiere de la del indice exhaustivo.
    hnsw_ef_search: int = 400
    # Similitud coseno, no RRF: RRF solo mide posicion, y una consulta ajena al corpus tambien
    # tiene un primero. Por debajo de este umbral se responde que no hay evidencia.
    evidence_threshold: float = 0.52
    # 12 fragmentos y como mucho 2 por documento. Frente a 8 y 3: recall 56% -> 74%.
    top_k: int = 12
    max_fragments_per_doc: int = 2

    # Reintentos del ciclo verificador -> orquestador. Cada vuelta son llamadas a modelo, y la
    # eficiencia se normaliza contra los demas equipos: al tope se redacta con lo que haya.
    max_retries: int = 2

    @property
    def origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
