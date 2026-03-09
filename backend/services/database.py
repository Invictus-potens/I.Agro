from typing import Generator
from sqlmodel import SQLModel, create_engine, Session
from backend.config import settings
from backend.models import User, Farm, Location, CurrentWeather, ForecastDay, ForecastHour

engine = create_engine(settings.DATABASE_URL)

def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session

def create_tables():
    print(f"Conectando ao banco de dados em: {settings.DB_HOST}")
    try:
        SQLModel.metadata.create_all(engine)
        print("Tabelas verificadas/criadas com sucesso.")
    except Exception as e:
        print(f"Erro ao criar tabelas: {e}")

create_tables()
