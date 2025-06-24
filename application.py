from contextlib import asynccontextmanager
import base64
import re
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional, List

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel as PydanticBaseModel

from sqlmodel import Field, Session, SQLModel, create_engine, Relationship, Column
from sqlalchemy.dialects.postgresql import JSONB, BYTEA

from jose import JWTError, jwt
from google.oauth2 import id_token
from google.auth.transport import requests

import google.generativeai as genai

from dotenv import load_dotenv
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SECRET_KEY = os.getenv("GOOGLE_CLIENT_SECRET")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 1 day
MODEL_NAME = "gemini-1.5-flash"

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set.")

genai.configure(api_key=GEMINI_API_KEY)

engine = create_engine(DATABASE_URL, echo=False)

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    name: Optional[str] = None
    picture: Optional[str] = None
    pdfs: List["PDF"] = Relationship(back_populates="user")

class PDF(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, index=True)
    filename: str
    upload_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    pdf_bytes: bytes = Field(sa_column=Column(BYTEA))
    user_id: int = Field(foreign_key="user.id")
    user: User = Relationship(back_populates="pdfs")
    chats: List["Chat"] = Relationship(back_populates="pdf")
    highlights: List["Highlight"] = Relationship(back_populates="pdf")

class Highlight(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    highlight_id_str: str = Field(index=True) 
    content: Dict[str, Any] = Field(sa_column=Column(JSONB))
    position: Dict[str, Any] = Field(sa_column=Column(JSONB))
    comment: Dict[str, Any] = Field(sa_column=Column(JSONB))

    pdf_id: uuid.UUID = Field(foreign_key="pdf.id")
    pdf: "PDF" = Relationship(back_populates="highlights")

class Chat(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    chat_id_str: str = Field(index=True) 
    history: List[Dict[str, Any]] = Field(default=[], sa_column=Column(JSONB))
    pdf_id: uuid.UUID = Field(foreign_key="pdf.id")
    pdf: PDF = Relationship(back_populates="chats")

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Creating database and tables...")
    create_db_and_tables()
    yield
    print("Shutting down...")

class BaseModel(PydanticBaseModel):
    class Config:
        from_attributes = True

class HighlightCreate(BaseModel):
    highlight_id_str: str
    content: Dict[str, Any]
    position: Dict[str, Any]
    comment: Dict[str, Any]

class GoogleToken(BaseModel):
    token: str

class UserInfo(BaseModel):
    email: str
    name: str
    picture: Optional[str] = None

class PdfDetails(BaseModel):
    id: uuid.UUID
    filename: str
    upload_date: datetime

class BranchInput(BaseModel):
    pdf_id: str
    id: str
    type: str
    content: str
    prompt: str

class ContinueInput(BaseModel):
    pdf_id: str
    id: str
    prompt: str

app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(db: Session = Depends(get_session), authorization: str = Header(...)) -> User:
    if "Bearer " not in authorization:
        raise HTTPException(status_code=401, detail="Invalid authorization scheme")
    token = authorization.split("Bearer ")[1]
    credentials_exception = HTTPException(
        status_code=401, detail="Could not validate credentials", headers={"WWW-Authenticate": "Bearer"}
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None: raise credentials_exception
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            user = User.from_orm(UserInfo(email=email, name=payload.get("name", ""), picture=payload.get("picture", "")))
            db.add(user)
            db.commit()
            db.refresh(user)
        return user
    except JWTError:
        raise credentials_exception

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.post("/auth/google")
async def auth_google(google_token: GoogleToken, db: Session = Depends(get_session)):
    try:
        idinfo = id_token.verify_oauth2_token(google_token.token, requests.Request(), GOOGLE_CLIENT_ID)
        email = idinfo['email']
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(email=email, name=idinfo.get('name'), picture=idinfo.get('picture'))
            db.add(user)
            db.commit()
            db.refresh(user)
        access_token = create_access_token(
            data={"sub": user.email, "name": user.name, "picture": user.picture},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        return {"access_token": access_token, "token_type": "bearer", "user_info": UserInfo.from_orm(user)}
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")

@app.post("/upload-pdf/")
async def upload_pdf(current_user: User = Depends(get_current_user), file: UploadFile = File(...), db: Session = Depends(get_session)):
    db_pdf = PDF(filename=file.filename, pdf_bytes=await file.read(), user_id=current_user.id)
    db.add(db_pdf)
    db.commit()
    db.refresh(db_pdf)
    return {"id": db_pdf.id, "filename": db_pdf.filename}

@app.get("/get-pdfs/", response_model=List[PdfDetails])
async def get_pdfs(current_user: User = Depends(get_current_user)):
    return current_user.pdfs

@app.get("/pdfs/{pdf_id}")
async def get_pdf_file(pdf_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    pdf = db.query(PDF).filter(PDF.id == pdf_id, PDF.user_id == current_user.id).first()
    if not pdf: raise HTTPException(status_code=404, detail="PDF not found")
    return Response(content=pdf.pdf_bytes, media_type="application/pdf")

def decode_base64_image(data_url: str) -> bytes:
    match = re.match(r"^data:image/\w+;base64,(.+)", data_url)
    if not match: raise ValueError("Invalid base64 image format.")
    return base64.b64decode(match.group(1))

# --- Chat Helper Functions ---

async def stream_and_save_chat(db: Session, db_chat: Chat, prompt_content: List[Any], pdf_bytes: Optional[bytes] = None):
    # This is the core logic change. We build a temporary history for the AI,
    # which is separate from the history we save to the database.
    
    history_for_ai = []
    
    # 1. If it's a new chat, prepend the PDF bytes for initial context.
    if pdf_bytes:
        history_for_ai.extend([
            {"role": "user", "parts": [
                {"mime_type": "application/pdf", "data": pdf_bytes},
                "This is the document. I will ask follow-up questions about specific parts I highlight."
            ]},
            {"role": "model", "parts": ["Understood. I have processed the document. I'm ready."]}
        ])
    
    # 2. Add the persistent, text-only history from the database.
    history_for_ai.extend(db_chat.history)

    # 3. Initialize the model and send the message.
    model = genai.GenerativeModel(MODEL_NAME)
    chat_session = model.start_chat(history=history_for_ai)
    
    # This is the user's new message. We will save THIS to the DB.
    # The Gemini API handles dicts for multi-part messages correctly.
    serializable_user_parts = []
    for part in prompt_content:
        if isinstance(part, str):
            serializable_user_parts.append({"text": part})
        # Note: We are not storing the image bytes in history, just the prompt text.
        # A more advanced implementation might store a URI to the image.
        elif isinstance(part, dict) and "text" in part:
             serializable_user_parts.append(part)

    db_chat.history.append({"role": "user", "parts": serializable_user_parts})
    
    full_response_text = ""
    try:
        response_stream = chat_session.send_message(prompt_content, stream=True)
        for chunk in response_stream:
            if chunk.text:
                full_response_text += chunk.text
                yield chunk.text
    except Exception as e:
        print(f"Error during streaming: {e}")
        yield f"An error occurred: {e}"
        # Rollback the user message we optimistically added
        db_chat.history.pop()
        return

    # 4. Once streaming is done, save the new user and model messages to the DB.
    db_chat.history.append({"role": "model", "parts": [{"text": full_response_text}]})
    
    db.add(db_chat)
    db.commit()


@app.post("/branch-chat/")
async def branch_chat(data: BranchInput, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    pdf_uuid = uuid.UUID(data.pdf_id)
    pdf = db.query(PDF).filter(PDF.id == pdf_uuid, PDF.user_id == current_user.id).first()
    if not pdf: raise HTTPException(status_code=404, detail="PDF not found.")
    
    db_chat = db.query(Chat).filter(Chat.pdf_id == pdf_uuid, Chat.chat_id_str == data.id).first()
    
    # For a new chat, we pass the PDF bytes to the stream handler.
    is_new_chat = not db_chat
    if is_new_chat:
        db_chat = Chat(chat_id_str=data.id, pdf_id=pdf_uuid, history=[])
    
    pdf_context_bytes = pdf.pdf_bytes if is_new_chat else None

    prompt_content = []
    if data.type == "text":
        prompt_content = [f"{data.prompt}\n\nRelevant text:\n{data.content}"]
    elif data.type == "image":
        try:
            image_bytes = decode_base64_image(data.content)
            prompt_content = [data.prompt, {"mime_type": "image/png", "data": image_bytes}]
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    else:
        raise HTTPException(status_code=400, detail="Invalid type.")

    return StreamingResponse(stream_and_save_chat(db, db_chat, prompt_content, pdf_bytes=pdf_context_bytes))

@app.post("/continue-chat/")
async def continue_chat(data: ContinueInput, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    pdf_uuid = uuid.UUID(data.pdf_id)
    db_chat = db.query(Chat).join(PDF).filter(
        Chat.pdf_id == pdf_uuid, Chat.chat_id_str == data.id, PDF.user_id == current_user.id
    ).first()
    if not db_chat: raise HTTPException(status_code=404, detail="Chat ID not found.")
    
    # We pass None for pdf_bytes because the context is already established.
    return StreamingResponse(stream_and_save_chat(db, db_chat, [data.prompt], pdf_bytes=None))

@app.get("/pdf-chats/{pdf_id}", response_model=Dict[str, List[Dict[str, Any]]])
async def get_all_chats(pdf_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    pdf = db.query(PDF).filter(PDF.id == pdf_id, PDF.user_id == current_user.id).first()
    if not pdf: raise HTTPException(status_code=404, detail="PDF not found")

    response_data: Dict[str, List[Dict[str, Any]]] = {}
    for chat in pdf.chats:
        # The history in the DB is now clean and doesn't need slicing.
        frontend_history = []
        for turn in chat.history:
            text_parts = [part.get("text", "") for part in turn.get("parts", [])]
            frontend_history.append({"role": turn.get("role"), "parts": text_parts})
        response_data[chat.chat_id_str] = frontend_history
        
    return response_data

@app.get("/pdfs/{pdf_id}/highlights", response_model=List[Highlight])
def get_highlights_for_pdf(pdf_id: uuid.UUID, session: Session = Depends(get_session)):
    pdf = session.get(PDF, pdf_id)
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    return pdf.highlights

@app.post("/pdfs/{pdf_id}/highlights", response_model=Highlight, tags=["Highlights"])
def create_highlight_for_pdf(
    pdf_id: uuid.UUID,
    highlight_data: HighlightCreate,
    session: Session = Depends(get_session)
):
    pdf = session.get(PDF, pdf_id)
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    db_highlight = Highlight(
        **highlight_data.model_dump(), 
        pdf_id=pdf_id
    )

    session.add(db_highlight)
    session.commit()
    
    session.refresh(db_highlight)

    return db_highlight