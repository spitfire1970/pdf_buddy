from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
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

load_dotenv()

# --- Configuration ---
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = "gemini-1.5-flash"
SECRET_KEY = os.getenv("GOOGLE_CLIENT_SECRET") # just some random long value
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 1 day

# --- Generative AI Setup ---
genai.configure(api_key=GEMINI_API_KEY)

# --- FastAPI App Initialization ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- In-memory storage ---
# In production, this should be a proper database (e.g., PostgreSQL, MongoDB).
# This new structure supports multiple users, each with multiple PDFs.
# user_data -> user_email -> pdfs -> pdf_id -> pdf_details
user_data: Dict[str, Dict[str, Any]] = {}


# --- Pydantic Models ---
class GoogleToken(BaseModel):
    token: str

class UserInfo(BaseModel):
    email: str
    name: str
    picture: Optional[str] = None

# This User model is derived from the JWT token
class User(BaseModel):
    email: str
    name: str
    picture: Optional[str] = None

class PdfDetails(BaseModel):
    id: str
    filename: str
    upload_date: datetime

# Updated chat inputs to include pdf_id
class BranchInput(BaseModel):
    pdf_id: str
    id: str  # highlight id
    type: str  # "text" or "image"
    content: str
    prompt: str

class ContinueInput(BaseModel):
    pdf_id: str
    id: str # highlight id
    prompt: str


# --- Authentication ---
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(authorization: str = Header(...)):
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
        user = User(email=email, name=payload.get("name", ""), picture=payload.get("picture", ""))
    except JWTError:
        raise credentials_exception
    return user


# --- Routes ---
@app.post("/auth/google")
async def auth_google(google_token: GoogleToken):
    try:
        idinfo = id_token.verify_oauth2_token(google_token.token, requests.Request(), GOOGLE_CLIENT_ID)
        user_info = UserInfo(
            email=idinfo['email'],
            name=idinfo.get('name', ''),
            picture=idinfo.get('picture', '')
        )
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user_info.email, "name": user_info.name, "picture": user_info.picture},
            expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer", "user_info": user_info.dict()}
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")

@app.post("/upload-pdf/")
async def upload_pdf(current_user: User = Depends(get_current_user), file: UploadFile = File(...)):
    user_id = current_user.email
    # Initialize user's data if not present
    if user_id not in user_data:
        user_data[user_id] = {"pdfs": {}}

    pdf_bytes = await file.read()
    pdf_id = str(uuid.uuid4())
    
    # Store PDF metadata and content
    user_data[user_id]["pdfs"][pdf_id] = {
        "id": pdf_id,
        "filename": file.filename,
        "upload_date": datetime.now(timezone.utc),
        "pdf_bytes": pdf_bytes,
        "main_chat": None, # Will be created on first branch
        "branched_chats": {}
    }

    # Return the new PDF's ID so the frontend can select it
    return {"id": pdf_id, "filename": file.filename}

@app.get("/get-pdfs/", response_model=List[PdfDetails])
async def get_pdfs(current_user: User = Depends(get_current_user)):
    user_id = current_user.email
    if user_id not in user_data or not user_data[user_id].get("pdfs"):
        return []
    
    # Return a list of PDF details, excluding the large byte content
    pdf_list = [
        PdfDetails(id=pdf["id"], filename=pdf["filename"], upload_date=pdf["upload_date"])
        for pdf in user_data[user_id]["pdfs"].values()
    ]
    return pdf_list

@app.get("/pdfs/{pdf_id}")
async def get_pdf_file(pdf_id: str, current_user: User = Depends(get_current_user)):
    user_id = current_user.email
    if user_id not in user_data or pdf_id not in user_data[user_id]["pdfs"]:
        raise HTTPException(status_code=404, detail="PDF not found")

    pdf_bytes = user_data[user_id]["pdfs"][pdf_id]["pdf_bytes"]
    return Response(content=pdf_bytes, media_type="application/pdf")

async def stream_chat_response(chat_obj, prompt):
    try:
        response_stream = chat_obj.send_message(prompt, stream=True)
        for chunk in response_stream:
            if chunk.text:
                yield chunk.text
    except Exception as e:
        print(f"Error during streaming: {e}")
        yield f"An error occurred: {e}"


def decode_base64_image(data_url: str) -> bytes:
    match = re.match(r"^data:image/\w+;base64,(.+)", data_url)
    if not match:
        raise ValueError("Invalid base64 image format.")
    return base64.b64decode(match.group(1))

def get_or_create_main_chat(user_id: str, pdf_id: str):
    """Lazily initializes the main chat session for a PDF."""
    pdf_info = user_data[user_id]["pdfs"][pdf_id]
    if pdf_info["main_chat"] is None:
        model = genai.GenerativeModel(MODEL_NAME)
        pdf_chat = model.start_chat(history=[
            {"role": "user", "parts": [
                {"mime_type": "application/pdf", "data": pdf_info["pdf_bytes"]},
                "Process this PDF. I will ask follow-up questions about specific parts."
            ]}
        ])
        pdf_chat.send_message("OK") # Send a short message to prime the chat
        pdf_info["main_chat"] = pdf_chat
    return pdf_info["main_chat"]

@app.post("/branch-chat/")
async def branch_chat(data: BranchInput, current_user: User = Depends(get_current_user)):
    user_id = current_user.email
    if user_id not in user_data or data.pdf_id not in user_data[user_id]["pdfs"]:
        raise HTTPException(status_code=404, detail="PDF not found for this user.")

    # Get the main chat for the specific PDF, creating it if it doesn't exist
    main_chat = get_or_create_main_chat(user_id, data.pdf_id)
    
    model = genai.GenerativeModel(MODEL_NAME)
    branched = model.start_chat(history=main_chat.history)
    user_data[user_id]["pdfs"][data.pdf_id]["branched_chats"][data.id] = branched

    if data.type == "text":
        message = f"{data.prompt}\n\nHere is the relevant text from the document:\n{data.content}"
    elif data.type == "image":
        try:
            image_bytes = decode_base64_image(data.content)
            message = [{"mime_type": "image/png", "data": image_bytes}, data.prompt]
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    else:
        raise HTTPException(status_code=400, detail="Invalid type. Use 'text' or 'image'.")

    return StreamingResponse(stream_chat_response(branched, message))

@app.post("/continue-chat/")
async def continue_chat(data: ContinueInput, current_user: User = Depends(get_current_user)):
    user_id = current_user.email
    branched_chats = user_data.get(user_id, {}).get("pdfs", {}).get(data.pdf_id, {}).get("branched_chats", {})
    
    if data.id not in branched_chats:
        raise HTTPException(status_code=404, detail="Chat ID not found for this PDF.")

    chat = branched_chats[data.id]
    return StreamingResponse(stream_chat_response(chat, data.prompt))