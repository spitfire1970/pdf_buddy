from typing import List, Optional, Any
from sqlmodel import Field, SQLModel, Relationship, JSON, Column
from sqlalchemy import LargeBinary
from datetime import datetime
import uuid

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    name: str
    picture: Optional[str] = None
    pdfs: List["PDF"] = Relationship(back_populates="user")

class PDF(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    filename: str
    upload_date: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    pdf_bytes: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    main_chat_history: Optional[List[Any]] = Field(default=None, sa_column=Column(JSON))
    branched_chats_histories: dict = Field(default_factory=dict, sa_column=Column(JSON))

    user_id: int = Field(foreign_key="user.id")
    user: "User" = Relationship(back_populates="pdfs")