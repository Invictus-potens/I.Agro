"""
Rota POST /api/chat.
"""
import os
import traceback
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)

from chat import handle_chat

app = FastAPI(title="Farmers Companion API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatBody(BaseModel):
    message: str
    history: list | None = None
    locationId: int | None = None


@app.get("/")
def root():
    return {"ok": True, "service": "Farmers Companion API"}


@app.post("/api/chat")
def api_chat(body: ChatBody):
    try:
        reply = handle_chat(
            message=body.message,
            history=body.history,
            location_id=body.locationId,
        )
        return {"reply": reply}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=502,
            detail="Erro ao processar mensagem. Tente novamente.",
        )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
