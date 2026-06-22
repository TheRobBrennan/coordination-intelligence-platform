from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All config from env — nothing hardcoded (see ../../.env.example)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "devpassword"
    neo4j_database: str = "neo4j"
    api_cors_origins: str = "http://localhost:3000"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.api_cors_origins.split(",") if o.strip()]


settings = Settings()
