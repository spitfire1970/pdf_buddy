import pathlib
from google.generativeai import configure, GenerativeModel, ChatSession

from google import genai

KEY="AIzaSyA98wiXCL7d6KZX0_IFhxVtUyXGkBH1a-o"

configure(api_key=KEY)

# client = genai.Client(api_key = KEY)


# print("List of models that support generateContent:\n")
# for m in client.models.list():
#     for action in m.supported_actions:
#         if action == "generateContent":
#             print(m.name)

# print("List of models that support embedContent:\n")
# for m in client.models.list():
#     for action in m.supported_actions:
#         if action == "embedContent":
#             print(m.name)

filepath = pathlib.Path("demo1.pdf")
pdf_bytes = filepath.read_bytes()

model = GenerativeModel("models/gemini-2.5-flash-preview-05-20")

chat = model.start_chat(history=[
    {"role": "user", "parts": [{"mime_type": "application/pdf", "data": pdf_bytes}, "Please process this PDF. I will ask follow-up questions asking you to explain certain parts of the pdf later."]}
])

initial_response = chat.send_message("Acknowledge that you've processed the PDF and are ready for questions.")
print("Initial AI response:", initial_response.text)

print("\n--- Current Chat History ---")
while True:
    user_question = input("Ask a question about the PDF (or type 'exit' to quit): ")
    if user_question.lower() == 'exit':
        break

    response = chat.send_message(user_question)
    print("AI's response:", response.text)

    message = chat.history[-1]
    print(f"{message.role}: {message.parts[0].text if 'text' in message.parts[0] else 'PDF'}")
    print("--------------------------\n")

print("Conversation ended.")