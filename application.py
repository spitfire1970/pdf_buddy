from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import base64
import google.generativeai as genai
import re
import os
from dotenv import load_dotenv
from google.oauth2 import id_token
from google.auth.transport import requests
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

load_dotenv()

# --- Configuration ---
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = "gemini-1.5-flash"
SECRET_KEY = os.getenv("GOOGLE_CLIENT_SECRET")
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

# --- In-memory storage for user chats (for demonstration) ---
# In a production app, you would use a database.
user_chats: Dict[str, Any] = {}


# --- Pydantic Models ---
class GoogleToken(BaseModel):
    token: str

class UserInfo(BaseModel):
    email: str
    name: str
    picture: Optional[str] = None

class User(BaseModel):
    email: str
    name: str
    picture: Optional[str] = None

class BranchInput(BaseModel):
    id: str
    type: str  # "text" or "image"
    content: str
    prompt: str

class ContinueInput(BaseModel):
    id: str
    prompt: str


# --- Authentication ---
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
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
        # In a real app, you would fetch the user from a database here
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

        # Here you would typically save the user to your database if they don't exist
        # For this example, we'll just create a token.

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
    try:
        user_id = current_user.email
        if user_id not in user_chats:
            user_chats[user_id] = {"main_chat": None, "branched_chats": {}}

        pdf_bytes = await file.read()
        model = genai.GenerativeModel(MODEL_NAME)

        pdf_chat = model.start_chat(history=[
            {
                "role": "user",
                "parts": [
                    {"mime_type": "application/pdf", "data": pdf_bytes},
                    "Please process this PDF. I will ask follow-up questions asking you to explain certain parts of the PDF later."
                ]
            }
        ])

        initial_response = pdf_chat.send_message("Acknowledge that you've processed the PDF and are ready for questions.")

        user_chats[user_id]["main_chat"] = pdf_chat
        return {
            "success": True,
            "message": initial_response.text
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

async def stream_chat_response(chat_obj, prompt):
    response_stream = chat_obj.send_message(prompt, stream=True)
    for chunk in response_stream:
        if chunk.text:
            yield chunk.text

def decode_base64_image(data_url: str) -> bytes:
    if not data_url.startswith("data:image"):
        raise ValueError("Expected base64 image data URL.")
    match = re.match(r"^data:image/\w+;base64,(.+)", data_url)
    if not match:
        raise ValueError("Invalid base64 image format.")
    base64_str = match.group(1)
    return base64.b64decode(base64_str + '===')


@app.post("/branch-chat/")
async def branch_chat(data: BranchInput, current_user: User = Depends(get_current_user)):
    user_id = current_user.email
    if user_id not in user_chats or user_chats[user_id].get("main_chat") is None:
        raise HTTPException(status_code=400, detail="No PDF has been uploaded for this user yet.")

    pdf_chat = user_chats[user_id]["main_chat"]
    model = genai.GenerativeModel(MODEL_NAME)
    branched = model.start_chat(history=pdf_chat.history)
    user_chats[user_id]["branched_chats"][data.id] = branched

    if data.type == "text":
        message = f"{data.prompt}\n\nText:\n{data.content}"
    elif data.type == "image":
        image_bytes = decode_base64_image(data.content)
        message = [{"mime_type": "image/png", "data": image_bytes}, data.prompt]
    else:
        raise HTTPException(status_code=400, detail="Invalid type. Use 'text' or 'image'.")

    return StreamingResponse(stream_chat_response(branched, message))

@app.post("/continue-chat/")
async def continue_chat(data: ContinueInput, current_user: User = Depends(get_current_user)):
    user_id = current_user.email
    if user_id not in user_chats or data.id not in user_chats[user_id]["branched_chats"]:
        raise HTTPException(status_code=404, detail="Chat ID not found for this user.")

    chat = user_chats[user_id]["branched_chats"][data.id]
    return StreamingResponse(stream_chat_response(chat, data.prompt))