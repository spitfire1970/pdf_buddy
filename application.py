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

genai.configure(api_key="AIzaSyCFRrbdc1uO1ZOqGc2Ej_0ZnLmfxntMp6M")

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
    # CHANGED: The history can now contain more complex objects, not just text parts.
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

# CHANGED: Pydantic models now accept an optional highlight_id
class BranchInput(BaseModel):
    pdf_id: str
    id: str
    type: str
    content: str
    prompt: str
    highlight_id: Optional[str] = None

class ContinueInput(BaseModel):
    pdf_id: str
    id: str
    prompt: str
    highlight_id: Optional[str] = None


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


async def stream_and_save_chat(
    db: Session,
    db_chat: Chat,
    prompt_for_ai: List[Any],
    user_message_to_save: Dict[str, Any],
    pdf_bytes: Optional[bytes] = None
):
    history_for_ai = []
    
    if pdf_bytes:
        history_for_ai.extend([
            {"role": "user", "parts": [
                {"mime_type": "application/pdf", "data": pdf_bytes},
                "This is the document. I will ask follow-up questions about specific parts I highlight."
            ]},
            {"role": "model", "parts": ["Understood. I have processed the document. I'm ready."]}
        ])
    
    # Add persistent history. We only need the text parts for the AI's context.
    for turn in db_chat.history:
        # Reconstruct history for the AI model, ensuring it's in the correct format
        ai_turn = {"role": turn["role"], "parts": []}
        for part in turn.get("parts", []):
             if isinstance(part, dict) and "text" in part:
                 ai_turn["parts"].append(part["text"])
             elif isinstance(part, str): # Legacy format support
                 ai_turn["parts"].append(part)
        history_for_ai.append(ai_turn)


    model = genai.GenerativeModel(MODEL_NAME)
    chat_session = model.start_chat(history=history_for_ai)
    
    # Create a temporary copy of the history to modify.
    # This ensures we don't change the DB state until the transaction is complete.
    temp_history = list(db_chat.history)
    temp_history.append(user_message_to_save)
    
    full_response_text = ""
    try:
        response_stream = chat_session.send_message(prompt_for_ai, stream=True)
        for chunk in response_stream:
            if chunk.text:
                full_response_text += chunk.text
                yield chunk.text
    except Exception as e:
        print(f"Error during streaming: {e}")
        yield f"An error occurred: {e}"
        # If an error occurs, we simply return and do not commit any changes.
        return

    # On success, save the model's response to our temporary history.
    temp_history.append({"role": "model", "parts": [{"text": full_response_text}]})
    
    # Assign the updated temporary history back to the database object.
    # This assignment explicitly marks the attribute as modified for SQLAlchemy.
    db_chat.history = temp_history
    
    db.add(db_chat)
    db.commit()


@app.post("/branched-chat/")
async def branched_chat(data: BranchInput, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    pdf_uuid = uuid.UUID(data.pdf_id)
    pdf = db.query(PDF).filter(PDF.id == pdf_uuid, PDF.user_id == current_user.id).first()
    if not pdf: raise HTTPException(status_code=404, detail="PDF not found.")
    
    db_chat = db.query(Chat).filter(Chat.pdf_id == pdf_uuid, Chat.chat_id_str == data.id).first()
    
    is_new_chat = not db_chat
    if is_new_chat:
        db_chat = Chat(chat_id_str=data.id, pdf_id=pdf_uuid, history=[])
    
    pdf_context_bytes = pdf.pdf_bytes

    prompt_for_ai = []
    if data.type == "text":
        prompt_for_ai = [f"{data.prompt}\n\nRelevant text:\n{data.content}"]
    elif data.type == "image":
        try:
            image_bytes = decode_base64_image(data.content)
            prompt_for_ai = [data.prompt, {"mime_type": "image/png", "data": image_bytes}]
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    
    # NEW: Construct the user message object that we want to save in the DB
    user_message_to_save = {"role": "user", "parts": [{"text": data.prompt}]}
    if data.highlight_id:
        user_message_to_save["highlight_id"] = data.highlight_id

    return StreamingResponse(stream_and_save_chat(db, db_chat, prompt_for_ai, user_message_to_save, pdf_bytes=pdf_context_bytes))

# @app.post("/continue-chat/")
# async def continue_chat(data: ContinueInput, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)):
#     pdf_uuid = uuid.UUID(data.pdf_id)
#     db_chat = db.query(Chat).join(PDF).filter(
#         Chat.pdf_id == pdf_uuid, Chat.chat_id_str == data.id, PDF.user_id == current_user.id
#     ).first()
#     if not db_chat: raise HTTPException(status_code=404, detail="Chat ID not found.")

#     # NEW: Construct the user message object for saving
#     user_message_to_save = {"role": "user", "parts": [{"text": data.prompt}]}
#     if data.highlight_id:
#         user_message_to_save["highlight_id"] = data.highlight_id
    
#     # For continue_chat, we always pass the prompt directly to the AI
#     prompt_for_ai = [data.prompt]

#     return StreamingResponse(stream_and_save_chat(db, db_chat, prompt_for_ai, user_message_to_save, pdf_bytes=None))

# CHANGED: The response model now sends the full message object, including highlightId
@app.get("/pdf-chats/{pdf_id}", response_model=Dict[str, List[Dict[str, Any]]])
async def get_all_chats(pdf_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    pdf = db.query(PDF).filter(PDF.id == pdf_id, PDF.user_id == current_user.id).first()
    if not pdf: raise HTTPException(status_code=404, detail="PDF not found")

    response_data: Dict[str, List[Dict[str, Any]]] = {}
    for chat in pdf.chats:
        frontend_history = []
        for turn in chat.history:
            # Reconstruct the message object for the frontend
            text_parts = [part.get("text", "") for part in turn.get("parts", [])]
            # Create a base message
            message_for_frontend = {"role": turn.get("role"), "parts": text_parts}
            # If a highlight_id exists in the DB record, add it to the object
            if "highlight_id" in turn:
                message_for_frontend["highlightId"] = turn["highlight_id"]
            
            frontend_history.append(message_for_frontend)
            
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