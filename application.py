from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import base64
import google.generativeai as genai

genai.configure(api_key="AIzaSyA98wiXCL7d6KZX0_IFhxVtUyXGkBH1a-o")
MODEL_NAME = "models/gemini-2.5-flash-preview-05-20"

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

    if data.type == "text":
        message = f"{data.prompt}\n\nText:\n{data.content}"
    elif data.type == "image":
        image_bytes = base64.b64decode(data.content)
        message = [{"mime_type": "image/png", "data": image_bytes}, data.prompt]
    else:
        raise HTTPException(status_code=400, detail="Invalid type. Use 'text' or 'image'.")

    response = branched.send_message(message)
    chat_id = data.id  # from frontend

    branched_chats[chat_id] = branched

    return {
        "success": True,
        "chat_id": chat_id,
        "history": chat_to_serializable(branched)
    }


@app.post("/continue-chat/")
async def continue_chat(data: ContinueInput):
    if data.id not in branched_chats:
        raise HTTPException(status_code=404, detail="Chat ID not found.")

    chat = branched_chats[data.id]
    response = chat.send_message(data.prompt)

    return {
        "success": True,
        "chat_id": data.id,
        "history": chat_to_serializable(chat)
    }