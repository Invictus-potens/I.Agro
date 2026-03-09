from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from .user import User

class Farm(SQLModel, table=True):
    __tablename__ = "farms"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    size_hectares: Optional[float] = None
    location_desc: Optional[str] = None
    owner_id: Optional[int] = Field(default=None, foreign_key="users.id")
    owner: Optional["User"] = Relationship(back_populates="farms")
