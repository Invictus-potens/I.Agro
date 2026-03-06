"""
Lógica do chat: cliente Node.js, Gemini e handler.
"""
import os
from typing import Any

import httpx
import google.generativeai as genai

# Configuração a partir do ambiente
NODE_API_URL = os.getenv("NODE_API_URL", "http://localhost:3000").rstrip("/")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

SYSTEM_INSTRUCTION = (
    "Você é a um assistente para fazendeiros e agricultores. "
    "Dê previsões meteorológicas, análise de tendências climáticas e suporte às decisões de colheita. "
    "Inclua recomendações sobre irrigação, controle de pragas e manejo da plantação. "
    "Responda em PT-BR de forma objetiva e clara."
)


def get_location_with_weather(location_id: int) -> dict[str, Any] | None:
    """Busca localidade com clima e previsão na API js."""
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(f"{NODE_API_URL}/locations/{location_id}")
            r.raise_for_status()
            return r.json()
    except (httpx.HTTPError, httpx.TimeoutException):
        return None


def build_weather_context(data: dict[str, Any]) -> str:
    """Transforma o JSON do Node em um parágrafo de contexto para o prompt."""
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


def call_gemini(message: str, contexto_clima: str | None = None) -> str:
    """Chama o Gemini com message, contexto de clima opcional."""
    if not GEMINI_API_KEY:
        return "Erro: GEMINI_API_KEY não configurada. Configure a chave no servidor."

    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(
        "gemini-pro",
        system_instruction=SYSTEM_INSTRUCTION,
    )

    # Monta todo o conteúdo: contexto de clima + histórico + mensagem atual
    content_parts = []
    if contexto_clima:
        content_parts.append(f"Dados atuais da região:\n{contexto_clima}\n\n")
    if history:
        for h in history[-10:]:
            role = h.get("role") or h.get("sender")
            text = h.get("content") or h.get("parts", [{}])[0].get("text", "")
            if not text:
                continue
            if role == "user":
                content_parts.append(f"Usuário: {text}\n")
            else:
                content_parts.append(f"Assistente: {text}\n")
    content_parts.append(f"Usuário: {message}")

    prompt = "\n".join(content_parts)
    response = model.generate_content(prompt)
    if not response or not response.text:
        return "Não foi possível obter resposta da IA."
    return response.text.strip()


def handle_chat(
    message: str,
    history: list | None = None,
    location_id: int | None = None,
) -> str:
    """
    Handler principal: valida message, opcionalmente busca dados no Node, chama Gemini e retorna a resposta.
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
