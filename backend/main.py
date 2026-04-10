"""
API principal: CRUD de clima/localidades + chat com Gemini + frontend estático.
"""
import os
import sys
import traceback
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Union

from dotenv import load_dotenv

_root = Path(__file__).resolve().parent.parent
load_dotenv(_root / ".env")
sys.path.insert(0, str(_root))


from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.models import Location, CurrentWeather, ForecastDay, ForecastHour
from backend.models.chat import Chat, ChatMessage
from backend.services.database import get_session
from backend.chat import handle_chat

app = FastAPI(title="Farmers Companion API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/config")
def get_public_config(request: Request):
    api_base_url = os.getenv("NODE_API_URL")
    if not api_base_url:
        api_base_url = str(request.base_url).rstrip("/")
    return {"apiBaseUrl": api_base_url}


# ── Schemas de request ────────────────────────────────────────────────────────
class LocationBody(BaseModel):
    name: str
    lat: float
    lon: float


class LocationUpdate(BaseModel):
    name: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None


class CurrentWeatherBody(BaseModel):
    location_id: int
    temp_c: float
    humidity: int
    precip_mm: float
    wind_kph: float
    condition_text: str
    uv: float


class CurrentWeatherUpdate(BaseModel):
    temp_c: Optional[float] = None
    humidity: Optional[int] = None
    precip_mm: Optional[float] = None
    wind_kph: Optional[float] = None
    condition_text: Optional[str] = None
    uv: Optional[float] = None


class ForecastHourBody(BaseModel):
    forecast_day_id: Optional[int] = None
    time: str
    temp_c: float
    condition_text: str
    chance_of_rain: int
    precip_mm: float
    humidity: int
    uv: float


class ForecastHourUpdate(BaseModel):
    forecast_day_id: Optional[int] = None
    time: Optional[str] = None
    temp_c: Optional[float] = None
    condition_text: Optional[str] = None
    chance_of_rain: Optional[int] = None
    precip_mm: Optional[float] = None
    humidity: Optional[int] = None
    uv: Optional[float] = None


class ForecastDayBody(BaseModel):
    location_id: int
    date: str
    maxtemp_c: float
    mintemp_c: float
    avgtemp_c: float
    totalprecip_mm: float
    avghumidity: float
    daily_chance_of_rain: int
    condition_text: str
    uv: float
    hours: Optional[List[ForecastHourBody]] = None


class ForecastDayUpdate(BaseModel):
    date: Optional[str] = None
    maxtemp_c: Optional[float] = None
    mintemp_c: Optional[float] = None
    avgtemp_c: Optional[float] = None
    totalprecip_mm: Optional[float] = None
    avghumidity: Optional[float] = None
    daily_chance_of_rain: Optional[int] = None
    condition_text: Optional[str] = None
    uv: Optional[float] = None


class ChatCreate(BaseModel):
    title: Optional[str] = "Nova Conversa"
    location_id: Optional[int] = None


class ChatUpdate(BaseModel):
    title: Optional[str] = None


class ChatBody(BaseModel):
    message: str
    chatId: Optional[Union[int, str]] = None
    history: Optional[list] = None
    locationId: Optional[int] = None


# ── Locations ─────────────────────────────────────────────────────────────────
@app.get("/locations")
def list_locations(session: Session = Depends(get_session)):
    return session.exec(select(Location)).all()


@app.get("/locations/{id}")
def get_location(id: int, session: Session = Depends(get_session)):
    loc = session.get(Location, id)
    if not loc:
        raise HTTPException(404, "not found")
    cw = session.exec(select(CurrentWeather).where(CurrentWeather.location_id == id)).first()
    days = session.exec(select(ForecastDay).where(ForecastDay.location_id == id)).all()
    days_with_hours = []
    for day in days:
        hours = session.exec(
            select(ForecastHour).where(ForecastHour.forecast_day_id == day.id)
        ).all()
        days_with_hours.append({**day.model_dump(), "hours": [h.model_dump() for h in hours]})
    return {
        **loc.model_dump(),
        "current_weather": cw.model_dump() if cw else None,
        "forecasts": days_with_hours,
    }


@app.post("/locations", status_code=201)
def create_location(body: LocationBody, session: Session = Depends(get_session)):
    loc = Location(**body.model_dump())
    session.add(loc)
    session.commit()
    session.refresh(loc)
    return loc


@app.put("/locations/{id}")
def update_location(id: int, body: LocationUpdate, session: Session = Depends(get_session)):
    loc = session.get(Location, id)
    if not loc:
        raise HTTPException(404, "not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(loc, k, v)
    session.add(loc)
    session.commit()
    session.refresh(loc)
    return loc


@app.delete("/locations/{id}", status_code=204)
def delete_location(id: int, session: Session = Depends(get_session)):
    loc = session.get(Location, id)
    if not loc:
        raise HTTPException(404, "not found")
    session.delete(loc)
    session.commit()


# ── Forecast Days ─────────────────────────────────────────────────────────────
@app.get("/forecast-days")
def list_forecast_days(session: Session = Depends(get_session)):
    return session.exec(select(ForecastDay)).all()


@app.get("/forecast-days/{id}")
def get_forecast_day(id: int, session: Session = Depends(get_session)):
    day = session.get(ForecastDay, id)
    if not day:
        raise HTTPException(404, "not found")
    hours = session.exec(
        select(ForecastHour).where(ForecastHour.forecast_day_id == id)
    ).all()
    return {**day.model_dump(), "hours": [h.model_dump() for h in hours]}


@app.post("/forecast-days", status_code=201)
def create_forecast_day(body: ForecastDayBody, session: Session = Depends(get_session)):
    hours_data = body.hours
    day = ForecastDay(**body.model_dump(exclude={"hours"}))
    session.add(day)
    session.commit()
    session.refresh(day)
    hours = []
    if hours_data:
        for h in hours_data:
            hour = ForecastHour(**{**h.model_dump(), "forecast_day_id": day.id})
            session.add(hour)
            hours.append(hour)
        session.commit()
        for h in hours:
            session.refresh(h)
    return {**day.model_dump(), "hours": [h.model_dump() for h in hours]}


@app.put("/forecast-days/{id}")
def update_forecast_day(id: int, body: ForecastDayUpdate, session: Session = Depends(get_session)):
    day = session.get(ForecastDay, id)
    if not day:
        raise HTTPException(404, "not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(day, k, v)
    session.add(day)
    session.commit()
    session.refresh(day)
    return day


@app.delete("/forecast-days/{id}", status_code=204)
def delete_forecast_day(id: int, session: Session = Depends(get_session)):
    day = session.get(ForecastDay, id)
    if not day:
        raise HTTPException(404, "not found")
    session.delete(day)
    session.commit()


# ── Forecast Hours ────────────────────────────────────────────────────────────
@app.get("/forecast-hours")
def list_forecast_hours(session: Session = Depends(get_session)):
    return session.exec(select(ForecastHour)).all()


@app.get("/forecast-hours/{id}")
def get_forecast_hour(id: int, session: Session = Depends(get_session)):
    hour = session.get(ForecastHour, id)
    if not hour:
        raise HTTPException(404, "not found")
    return hour


@app.post("/forecast-hours", status_code=201)
def create_forecast_hour(body: ForecastHourBody, session: Session = Depends(get_session)):
    hour = ForecastHour(**body.model_dump())
    session.add(hour)
    session.commit()
    session.refresh(hour)
    return hour


@app.put("/forecast-hours/{id}")
def update_forecast_hour(id: int, body: ForecastHourUpdate, session: Session = Depends(get_session)):
    hour = session.get(ForecastHour, id)
    if not hour:
        raise HTTPException(404, "not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(hour, k, v)
    session.add(hour)
    session.commit()
    session.refresh(hour)
    return hour


@app.delete("/forecast-hours/{id}", status_code=204)
def delete_forecast_hour(id: int, session: Session = Depends(get_session)):
    hour = session.get(ForecastHour, id)
    if not hour:
        raise HTTPException(404, "not found")
    session.delete(hour)
    session.commit()


# ── Current Weather ───────────────────────────────────────────────────────────
@app.get("/current-weather")
def list_current_weather(session: Session = Depends(get_session)):
    return session.exec(select(CurrentWeather)).all()


@app.get("/current-weather/{id}")
def get_current_weather(id: int, session: Session = Depends(get_session)):
    cw = session.get(CurrentWeather, id)
    if not cw:
        raise HTTPException(404, "not found")
    return cw


@app.post("/current-weather", status_code=201)
def create_current_weather(body: CurrentWeatherBody, session: Session = Depends(get_session)):
    cw = CurrentWeather(**body.model_dump())
    session.add(cw)
    session.commit()
    session.refresh(cw)
    return cw


@app.put("/current-weather/{id}")
def update_current_weather(id: int, body: CurrentWeatherUpdate, session: Session = Depends(get_session)):
    cw = session.get(CurrentWeather, id)
    if not cw:
        raise HTTPException(404, "not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(cw, k, v)
    session.add(cw)
    session.commit()
    session.refresh(cw)
    return cw


@app.delete("/current-weather/{id}", status_code=204)
def delete_current_weather(id: int, session: Session = Depends(get_session)):
    cw = session.get(CurrentWeather, id)
    if not cw:
        raise HTTPException(404, "not found")
    session.delete(cw)
    session.commit()


# ── Chats ─────────────────────────────────────────────────────────────────────
@app.get("/api/chats")
def list_chats(session: Session = Depends(get_session)):
    chats = session.exec(select(Chat).order_by(Chat.updated_at.desc())).all()
    result = []
    for chat in chats:
        msgs = session.exec(
            select(ChatMessage).where(ChatMessage.chat_id == chat.id)
        ).all()
        result.append({**chat.model_dump(), "messages": [m.model_dump() for m in msgs]})
    return result


@app.post("/api/chats", status_code=201)
def create_chat(body: ChatCreate, session: Session = Depends(get_session)):
    chat = Chat(title=body.title or "Nova Conversa", location_id=body.location_id)
    session.add(chat)
    session.commit()
    session.refresh(chat)
    return {**chat.model_dump(), "chatId": chat.id}


@app.get("/api/chats/{id}")
def get_chat(id: int, session: Session = Depends(get_session)):
    chat = session.get(Chat, id)
    if not chat:
        raise HTTPException(404, "not found")
    msgs = session.exec(
        select(ChatMessage)
        .where(ChatMessage.chat_id == id)
        .order_by(ChatMessage.created_at)
    ).all()
    return {**chat.model_dump(), "messages": [m.model_dump() for m in msgs]}


@app.put("/api/chats/{id}")
def update_chat(id: int, body: ChatUpdate, session: Session = Depends(get_session)):
    chat = session.get(Chat, id)
    if not chat:
        raise HTTPException(404, "not found")
    if body.title is not None:
        chat.title = body.title
    chat.updated_at = datetime.utcnow()
    session.add(chat)
    session.commit()
    session.refresh(chat)
    return {**chat.model_dump(), "chatId": chat.id}


@app.delete("/api/chats/{id}", status_code=204)
def delete_chat(id: int, session: Session = Depends(get_session)):
    chat = session.get(Chat, id)
    if not chat:
        raise HTTPException(404, "not found")
    for msg in session.exec(select(ChatMessage).where(ChatMessage.chat_id == id)).all():
        session.delete(msg)
    session.delete(chat)
    session.commit()


# ── Chat (Gemini) ─────────────────────────────────────────────────────────────
@app.post("/api/chat")
def api_chat(body: ChatBody, session: Session = Depends(get_session)):
    try:
        reply = handle_chat(
            message=body.message,
            history=body.history,
            location_id=body.locationId,
        )

        chat_id = body.chatId
        if chat_id and not str(chat_id).startswith("local_"):
            try:
                chat = session.get(Chat, int(chat_id))
                if chat:
                    session.add(ChatMessage(chat_id=chat.id, role="user", content=body.message))
                    session.add(ChatMessage(chat_id=chat.id, role="assistant", content=reply))
                    chat.updated_at = datetime.utcnow()
                    session.add(chat)
                    session.commit()
            except (ValueError, TypeError):
                pass

        return {"reply": reply}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=502, detail="Erro ao processar mensagem. Tente novamente.")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "58731"))
    uvicorn.run(app, host="0.0.0.0", port=port)
