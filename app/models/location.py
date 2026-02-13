from typing import Optional, List, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from .current_weather import CurrentWeather
    from .forecast_day import ForecastDay

class Location(SQLModel, table=True):
    __tablename__ = "locations"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    region: Optional[str] = None
    country: Optional[str] = None
    lat: float
    lon: float
    tz_id: Optional[str] = None
    current_weather: List["CurrentWeather"] = Relationship(back_populates="location")
    forecasts: List["ForecastDay"] = Relationship(back_populates="location")
