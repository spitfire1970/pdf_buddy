from typing import List, Optional, Any, Dict
from sqlmodel import Field, SQLModel, Relationship, Column
from datetime import datetime, timezone
from sqlalchemy.dialects.postgresql import BYTEA, JSONB
import uuid

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    name: str
    picture: Optional[str] = None
    pdfs: List["PDF"] = Relationship(back_populates="user")


class Message(SQLModel, table=True):
    __tablename__ = "message"
    id: Optional[int] = Field(default=None, primary_key=True)
    role: str
    parts: List[Dict[str, str]] = Field(sa_column=Column(JSONB))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    chat_id: int = Field(foreign_key="chat.id")
    chat: "Chat" = Relationship(back_populates="messages")
    highlight: Optional["Highlight"] = Relationship(
        back_populates="message", sa_relationship_kwargs={"uselist": False}
    )


class Highlight(SQLModel, table=True):
    __tablename__ = "highlight"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    content: Dict[str, Any] = Field(sa_column=Column(JSONB))
    position: Dict[str, Any] = Field(sa_column=Column(JSONB))
    comment: Dict[str, Any] = Field(sa_column=Column(JSONB))
    pdf_id: uuid.UUID = Field(foreign_key="pdf.id")
    pdf: "PDF" = Relationship(back_populates="highlights")
    message_id: int = Field(foreign_key="message.id", unique=True)
    message: "Message" = Relationship(back_populates="highlight")


class Chat(SQLModel, table=True):
    __tablename__ = "chat"
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(default="New Chat", nullable=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    pdf_id: uuid.UUID = Field(foreign_key="pdf.id")
    pdf: "PDF" = Relationship(back_populates="chats")
    messages: List["Message"] = Relationship(back_populates="chat")


class PDF(SQLModel, table=True):
    __tablename__ = "pdf"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    filename: str
    upload_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    pdf_bytes: bytes = Field(sa_column=Column(BYTEA, nullable=False))
    user_id: int = Field(foreign_key="user.id")
    user: "User" = Relationship(back_populates="pdfs")
    chats: List["Chat"] = Relationship(back_populates="pdf")
    highlights: List["Highlight"] = Relationship(back_populates="pdf")