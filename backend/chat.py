"""
Lógica do chat: acesso ao banco de dados, chamada direta ao Gemini e handler.
"""
import logging
import os
from typing import Any

import google.generativeai as genai

from backend.services import mcp_client

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "Você é um assistente agrícola especializado em clima e agricultura brasileira. "
    "Responda em português, de forma clara e objetiva. "
    "Use os dados de clima fornecidos no contexto para embasar suas respostas sobre "
    "previsões, plantio, irrigação e manejo de culturas."
)


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


def call_gemini_simple(
    message: str, history: list | None = None, contexto_clima: str | None = None
) -> str:
    """Chama o Gemini via SDK sem ferramentas MCP."""
    genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        system_instruction=SYSTEM_PROMPT,
    )

    gemini_history = []
    for msg in (history or []):
        role = "model" if msg.get("role") == "assistant" else "user"
        gemini_history.append({"role": role, "parts": [msg.get("content", "")]})

    user_content = message
    if contexto_clima:
        user_content = f"Contexto do clima:\n{contexto_clima}\n\nPergunta: {message}"

    chat = model.start_chat(history=gemini_history)
    try:
        response = chat.send_message(user_content, request_options={"timeout": 120})
        return response.text.strip()
    except Exception as e:
        return f"Erro ao contatar o Gemini: {str(e)}"


def call_gemini(message: str, history: list | None = None, contexto_clima: str | None = None) -> str:
    """
    Chama o Gemini. Se MCP_SERVER_URL estiver definida e o fluxo MCP+tools funcionar,
    usa function calling contra o servidor MCP; caso contrário, cai no caminho simples.
    """
    mcp_url = mcp_client.mcp_url_from_env()
    if mcp_url:
        try:
            from backend.gemini_mcp import run_gemini_with_mcp_tools

            return run_gemini_with_mcp_tools(
                message=message,
                history=history,
                contexto_clima=contexto_clima,
                system_instruction=SYSTEM_PROMPT,
                mcp_url=mcp_url,
            )
        except Exception as e:
            logger.warning("Fluxo MCP+Gemini indisponível, usando chat simples: %s", e, exc_info=True)
    return call_gemini_simple(message, history=history, contexto_clima=contexto_clima)


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

    return call_gemini(msg, history=history or [], contexto_clima=contexto_clima)
