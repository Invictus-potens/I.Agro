from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from .location import Location

class CurrentWeather(SQLModel, table=True):
    __tablename__ = "current_weather"

    id: Optional[int] = Field(default=None, primary_key=True)
    location_id: Optional[int] = Field(default=None, foreign_key="locations.id")
    temp_c: float
    humidity: int
    precip_mm: float
    wind_kph: float
    condition_text: str
    uv: float
    location: Optional["Location"] = Relationship(back_populates="current_weather")
