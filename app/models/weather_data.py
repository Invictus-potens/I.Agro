from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field

class WeatherData(SQLModel, table=True):
    __tablename__ = "weather_data"

    id: Optional[int] = Field(default=None, primary_key=True)
    city_name: str
    region: str
    country: str
    lat: float
    lon: float
    geom: Optional[str] = None
    temp_c: float
    humidity: int
    condition_text: str
    wind_kph: float
    captured_at: datetime = Field(default_factory=datetime.utcnow)
