from typing import Optional, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship


class Chat(SQLModel, table=True):
    __tablename__ = "chats"

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(default="Nova Conversa", max_length=255)
    location_id: Optional[int] = Field(default=None)
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)

    messages: List["ChatMessage"] = Relationship(back_populates="chat")


class ChatMessage(SQLModel, table=True):
    __tablename__ = "chat_messages"

    id: Optional[int] = Field(default=None, primary_key=True)
    chat_id: int = Field(foreign_key="chats.id")
    role: str = Field(max_length=20)
    content: str
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)

    chat: Optional[Chat] = Relationship(back_populates="messages")
