"""
Lógica do chat: acesso ao banco de dados, webhook n8n e handler.
"""
import os
from typing import Any

import httpx

WEBHOOK_URL = "https://n8n.pradortiz.lat/webhook/319e00f2-eeb7-42fc-bd95-7d3b90d97cdc"


def get_location_with_weather(location_id: int) -> dict[str, Any] | None:
    """Busca localidade com clima e previsão diretamente no banco de dados."""
    try:
        from sqlmodel import Session, select
        from backend.models import Location, CurrentWeather, ForecastDay
        from backend.services.database import engine

        with Session(engine) as session:
            location = session.get(Location, location_id)
            if not location:
                return None
            cw = session.exec(
                select(CurrentWeather).where(CurrentWeather.location_id == location_id)
            ).first()
            forecasts = session.exec(
                select(ForecastDay).where(ForecastDay.location_id == location_id)
            ).all()
            return {
                "name": location.name,
                "current_weather": cw.model_dump() if cw else None,
                "forecasts": [f.model_dump() for f in forecasts],
            }
    except Exception:
        return None


def build_weather_context(data: dict[str, Any]) -> str:
    """Transforma o JSON do banco em um parágrafo de contexto para o prompt."""
    parts = []
    name = data.get("name") or "Local"
    parts.append(f"Local: {name}.")

    cw = data.get("current_weather")
    if cw:
        parts.append(
            f"Tempo atual: {cw.get('temp_c')} °C, umidade {cw.get('humidity')}%, "
            f"condição {cw.get('condition_text', 'N/A')}, UV {cw.get('uv')}."
        )

    forecasts = data.get("forecasts") or []
    if forecasts:
        parts.append("Previsão dos próximos dias:")
        for fd in forecasts[:5]:
            date = fd.get("date", "")
            maxtemp = fd.get("maxtemp_c")
            mintemp = fd.get("mintemp_c")
            rain = fd.get("daily_chance_of_rain")
            cond = fd.get("condition_text", "")
            line = f"  {date}: max {maxtemp}°C, min {mintemp}°C, chance de chuva {rain}%, {cond}"
            parts.append(line)

    return " ".join(parts) if parts else "Sem dados de clima disponíveis."


def call_webhook(message: str, history: list | None = None, contexto_clima: str | None = None) -> str:
    """Envia a mensagem para o webhook n8n e retorna a resposta."""
    payload = {
        "message": message,
        "history": history or [],
        "contexto_clima": contexto_clima or "",
    }
    try:
        with httpx.Client(timeout=120.0) as client:
            response = client.post(WEBHOOK_URL, json=payload)
            response.raise_for_status()
            data = response.json()
            # Aceita diferentes formatos de resposta do n8n
            reply = (
                data.get("reply")
                or data.get("message")
                or data.get("output")
                or data.get("text")
                or (data[0].get("reply") or data[0].get("message") or data[0].get("output") or data[0].get("text") if isinstance(data, list) and data else None)
            )
            if not reply:
                return "Não foi possível obter resposta da IA."
            return str(reply).strip()
    except httpx.TimeoutException:
        return "A IA demorou muito para responder. Tente novamente."
    except Exception as e:
        return f"Erro ao contatar o assistente: {str(e)}"


def handle_chat(
    message: str,
    history: list | None = None,
    location_id: int | None = None,
) -> str:
    """
    Handler principal: valida message, busca dados no banco, chama Gemini e retorna a resposta.
    """
    msg = (message or "").strip()
    if not msg:
        return "Envie uma mensagem para continuar."
    if len(msg) > 4000:
        return "Mensagem muito longa. Resuma em até 4000 caracteres."

    contexto_clima = None
    if location_id is not None:
        data = get_location_with_weather(location_id)
        if data:
            contexto_clima = build_weather_context(data)
        else:
            contexto_clima = "Dados da região temporariamente indisponíveis."

    return call_webhook(msg, history=history or [], contexto_clima=contexto_clima)
