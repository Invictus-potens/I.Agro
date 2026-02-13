from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from .forecast_day import ForecastDay

class ForecastHour(SQLModel, table=True):
    __tablename__ = "forecast_hours"

    id: Optional[int] = Field(default=None, primary_key=True)
    forecast_day_id: Optional[int] = Field(default=None, foreign_key="forecast_days.id")
    time: str
    temp_c: float
    condition_text: str
    chance_of_rain: int
    precip_mm: float
    humidity: int
    uv: float
    forecast_day: Optional["ForecastDay"] = Relationship(back_populates="hours")
