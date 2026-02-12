from typing import Optional, List, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from .location import Location
    from .forecast_hour import ForecastHour

class ForecastDay(SQLModel, table=True):
    __tablename__ = "forecast_days"

    id: Optional[int] = Field(default=None, primary_key=True)
    location_id: Optional[int] = Field(default=None, foreign_key="locations.id")
    date: str
    maxtemp_c: float
    mintemp_c: float
    avgtemp_c: float
    totalprecip_mm: float
    avghumidity: float
    daily_chance_of_rain: int
    condition_text: str
    uv: float
    location: Optional["Location"] = Relationship(back_populates="forecasts")
    hours: List["ForecastHour"] = Relationship(back_populates="forecast_day")
