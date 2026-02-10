from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None)

    # Railway adja
    PORT: int = 8000

    # Opcionális a későbbi DB v1/v2-höz (Railway Postgres: DATABASE_URL)
    DATABASE_URL: str | None = None

    # Guard defaults
    DEFAULT_TIMEZONE: str = "Europe/Athens"

    # Ha később be akarsz tenni egy egyszerű “backend key” védelmet:
    EMORIA_API_KEY: str | None = None

settings = Settings()
