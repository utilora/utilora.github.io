from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    app_name: str = "A股智能研究平台"
    demo_mode: bool = True
    web_origin: str = "http://localhost:5173"
    model_public_visibility: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()

