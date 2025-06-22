from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, ConfigDict
import base64
import google.generativeai as genai
import re
import os
import uuid
from dotenv import load_dotenv
from google.oauth2 import id_token
from google.auth.transport import requests
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional, List
from sqlmodel import Session, select
from sqlalchemy.ext.mutable import flag_modified # FINAL CORRECTED IMPORT

# Import database and model related modules
# We now need the 'engine' for creating new sessions manually
import models
from database import create_db_and_tables, get_session, engine

load_dotenv()

# --- Configuration ---
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = "gemini-1.5-flash"
SECRET_KEY = os.getenv("GOOGLE_CLIENT_SECRET")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day

# --- Generative AI Setup ---
genai.configure(api_key=GEMINI_API_KEY)

# --- FastAPI App Initialization ---
app = FastAPI()

@app.on_event("startup")
def on_startup():
    create_db_and_tables()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Helper Function ---
def to_serializable_history(history):
    """Converts a Generative AI chat history to a JSON-serializable format."""
    serializable = []
    for content in history:
        # Do not include the initial large PDF data in the saved history
        if any(hasattr(part, 'inline_data') for part in content.parts):
            continue
        parts = [{'text': part.text} for part in content.parts if hasattr(part, 'text')]
        if parts:
            serializable.append({'role': content.role, 'parts': parts})
    return serializable

# --- Pydantic Models ---
class GoogleToken(BaseModel):
    token: str

class UserInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    email: str
    name: str
    picture: Optional[str] = None

class User(BaseModel):
    email: str
    name: str
    picture: Optional[str] = None

class PdfDetails(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    filename: str
    upload_date: datetime

class BranchInput(BaseModel):
    pdf_id: uuid.UUID
    id: str
    type: str
    content: str
    prompt: str

class ContinueInput(BaseModel):
    pdf_id: uuid.UUID
    id: str
    prompt: str

# --- Authentication ---
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(authorization: str = Header(...), session: Session = Depends(get_session)):
    token = authorization.split("Bearer ")[1]
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        user = session.exec(select(models.User).where(models.User.email == email)).first()
        if user is None:
            raise credentials_exception
        return user
    except JWTError:
        raise credentials_exception

# --- Routes ---
@app.post("/auth/google")
async def auth_google(google_token: GoogleToken, session: Session = Depends(get_session)):
    try:
        idinfo = id_token.verify_oauth2_token(google_token.token, requests.Request(), GOOGLE_CLIENT_ID)
        email = idinfo['email']
        user = session.exec(select(models.User).where(models.User.email == email)).first()
        if not user:
            user = models.User(email=email, name=idinfo.get('name', ''), picture=idinfo.get('picture', ''))
            session.add(user)
            session.commit()
            session.refresh(user)
        
        user_info = UserInfo.from_orm(user)
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.email, "name": user.name, "picture": user.picture},
            expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer", "user_info": user_info.dict()}
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")

@app.post("/upload-pdf/")
async def upload_pdf(current_user: models.User = Depends(get_current_user), file: UploadFile = File(...), session: Session = Depends(get_session)):
    pdf_bytes = await file.read()
    new_pdf = models.PDF(filename=file.filename, pdf_bytes=pdf_bytes, user_id=current_user.id)
    session.add(new_pdf)
    session.commit()
    session.refresh(new_pdf)
    return {"id": new_pdf.id, "filename": new_pdf.filename}

@app.get("/get-pdfs/", response_model=List[PdfDetails])
async def get_pdfs(current_user: models.User = Depends(get_current_user), session: Session = Depends(get_session)):
    pdfs = session.exec(select(models.PDF).where(models.PDF.user_id == current_user.id)).all()
    return [PdfDetails.from_orm(pdf) for pdf in pdfs]

@app.get("/pdfs/{pdf_id}")
async def get_pdf_file(pdf_id: uuid.UUID, current_user: models.User = Depends(get_current_user), session: Session = Depends(get_session)):
    pdf = session.exec(select(models.PDF).where(models.PDF.id == pdf_id, models.PDF.user_id == current_user.id)).first()
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    return Response(content=pdf.pdf_bytes, media_type="application/pdf")

@app.get("/pdfs/{pdf_id}/chats")
async def get_pdf_chats(pdf_id: uuid.UUID, current_user: models.User = Depends(get_current_user), session: Session = Depends(get_session)):
    pdf = session.exec(
        select(models.PDF).where(models.PDF.id == pdf_id, models.PDF.user_id == current_user.id)
    ).first()

    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    return pdf.branched_chats_histories or {}

async def stream_chat_response(chat_obj, prompt, on_chunk):
    try:
        response_stream = chat_obj.send_message(prompt, stream=True)
        for chunk in response_stream:
            if chunk.text:
                on_chunk(chunk.text)
                yield chunk.text
    except Exception as e:
        print(f"Error during streaming: {e}")
        yield f"An error occurred: {e}"

def decode_base64_image(data_url: str) -> bytes:
    match = re.match(r"^data:image/\w+;base64,(.+)", data_url)
    if not match:
        raise ValueError("Invalid base64 image format.")
    return base64.b64decode(match.group(1))

def get_or_create_main_chat(pdf: models.PDF, session: Session):
    model = genai.GenerativeModel(MODEL_NAME)
    live_history = [{"role": "user", "parts": [{"mime_type": "application/pdf", "data": pdf.pdf_bytes}]}]
    
    if pdf.main_chat_history:
        live_history.extend(pdf.main_chat_history)
    else:
        live_history.append({"role": "model", "parts": [{"text": "PDF processed. Ready for questions."}]})

    pdf_chat = model.start_chat(history=live_history)
    
    if not pdf.main_chat_history:
        pdf.main_chat_history = to_serializable_history(pdf_chat.history)
        session.commit()
        
    return pdf_chat

@app.post("/branch-chat/")
async def branch_chat(data: BranchInput, current_user: models.User = Depends(get_current_user), session: Session = Depends(get_session)):
    pdf = session.exec(select(models.PDF).where(models.PDF.id == data.pdf_id, models.PDF.user_id == current_user.id)).first()
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found for this user.")

    main_chat = get_or_create_main_chat(pdf, session)
    
    model = genai.GenerativeModel(MODEL_NAME)
    branched_chat = model.start_chat(history=main_chat.history)
    
    if data.type == "text":
        message = f"{data.prompt}\n\nHere is the relevant text from the document:\n{data.content}"
    elif data.type == "image":
        try:
            image_bytes = decode_base64_image(data.content)
            message = [data.prompt, {"mime_type": "image/png", "data": image_bytes}]
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    else:
        raise HTTPException(status_code=400, detail="Invalid type. Use 'text' or 'image'.")

    async def response_generator():
        async for chunk in stream_chat_response(branched_chat, message, lambda chunk: None):
            yield chunk

        with Session(engine) as new_session:
            pdf_to_update = new_session.get(models.PDF, data.pdf_id)
            if pdf_to_update:
                new_histories = (pdf_to_update.branched_chats_histories or {}).copy()
                new_histories[data.id] = to_serializable_history(branched_chat.history)
                
                pdf_to_update.branched_chats_histories = new_histories
                flag_modified(pdf_to_update, "branched_chats_histories")
                
                new_session.add(pdf_to_update)
                new_session.commit()

    return StreamingResponse(response_generator())

@app.post("/continue-chat/")
async def continue_chat(data: ContinueInput, current_user: models.User = Depends(get_current_user), session: Session = Depends(get_session)):
    pdf = session.exec(select(models.PDF).where(models.PDF.id == data.pdf_id, models.PDF.user_id == current_user.id)).first()
    if not pdf or not pdf.branched_chats_histories or data.id not in pdf.branched_chats_histories:
        raise HTTPException(status_code=404, detail="Chat ID not found for this PDF.")

    live_history = [
        {"role": "user", "parts": [{"mime_type": "application/pdf", "data": pdf.pdf_bytes}]},
        *pdf.branched_chats_histories[data.id]
    ]
    
    model = genai.GenerativeModel(MODEL_NAME)
    chat = model.start_chat(history=live_history)

    async def response_generator():
        async for chunk in stream_chat_response(chat, data.prompt, lambda chunk: None):
            yield chunk
        
        with Session(engine) as new_session:
            pdf_to_update = new_session.get(models.PDF, data.pdf_id)
            if pdf_to_update:
                new_histories = pdf_to_update.branched_chats_histories.copy()
                new_histories[data.id] = to_serializable_history(chat.history)

                pdf_to_update.branched_chats_histories = new_histories
                flag_modified(pdf_to_update, "branched_chats_histories")
                
                new_session.add(pdf_to_update)
                new_session.commit()

    return StreamingResponse(response_generator())