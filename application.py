from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import base64
import google.generativeai as genai
import re
import os
from dotenv import load_dotenv

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
MODEL_NAME = "gemini-1.5-flash"  # Updated to a recommended model

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pdf_chat = None
branched_chats = {}

class BranchInput(BaseModel):
    id: str
    type: str  # "text" or "image"
    content: str
    prompt: str

class ContinueInput(BaseModel):
    id: str
    prompt: str

async def stream_chat_response(chat_obj, prompt):
    """
    Asynchronous generator to stream responses from the generative AI model.
    """
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

def chat_to_serializable(chat):
    return [
        {"role": turn.role, "parts": [p.text if hasattr(p, "text") else str(p) for p in turn.parts]}
        for turn in chat.history
    ]

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.post("/upload-pdf/")
async def upload_pdf(file: UploadFile = File(...)):
    global pdf_chat

    try:
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

        return {
            "success": True,
            "message": initial_response.text
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/branch-chat/")
async def branch_chat(data: BranchInput):
    global pdf_chat

    if pdf_chat is None:
        raise HTTPException(status_code=400, detail="No PDF has been uploaded yet.")

    model = genai.GenerativeModel(MODEL_NAME)
    branched = model.start_chat(history=pdf_chat.history)
    branched_chats[data.id] = branched

    if data.type == "text":
        message = f"{data.prompt}\n\nText:\n{data.content}"
    elif data.type == "image":
        image_bytes = decode_base64_image(data.content)
        message = [{"mime_type": "image/png", "data": image_bytes}, data.prompt]
    else:
        raise HTTPException(status_code=400, detail="Invalid type. Use 'text' or 'image'.")

    return StreamingResponse(stream_chat_response(branched, message))

@app.post("/continue-chat/")
async def continue_chat(data: ContinueInput):
    if data.id not in branched_chats:
        raise HTTPException(status_code=404, detail="Chat ID not found.")

    chat = branched_chats[data.id]
    return StreamingResponse(stream_chat_response(chat, data.prompt))