from typing import Optional, List, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from .current_weather import CurrentWeather
    from .forecast_day import ForecastDay

class Location(SQLModel, table=True):
    __tablename__ = "locations"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    lat: float
    lon: float
    current_weather: List["CurrentWeather"] = Relationship(back_populates="location")
    forecasts: List["ForecastDay"] = Relationship(back_populates="location")
