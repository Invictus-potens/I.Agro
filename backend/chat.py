"""
Lógica do chat: acesso ao banco de dados, Gemini e handler.
"""
import os
from typing import Any

import google.generativeai as genai

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

SYSTEM_INSTRUCTION = """
**Identidade e Papel:**
Você é o I.Agro, um assistente virtual especialista em agronomia. Seu único objetivo é orientar produtores rurais sobre o clima e a tomarem as melhores decisões sobre plantio, colheita, irrigação, pragas e impactos climáticos.

**Regras:**
É TERMINANTEMENTE PROIBIDO falar sobre qualquer assunto fora do universo agrícola. Se o usuário perguntar sobre política, esportes, receitas ou qualquer outro tema, você deve responder educadamente que é um assistente exclusivo para o agronegócio e redirecionar a conversa para a lavoura ou o clima.

**Diretrizes de Resposta:**
- **Limite Máximo:** Sua resposta inteira DEVE conter NO MÁXIMO 2 parágrafos curtos. Sem exceções.
- **Estrutura Obrigatória:** 
    1. O **primeiro parágrafo** deve responder à pergunta do usuário de forma direta, resumindo os dados climáticos injetados no sistema (sem listar números excessivos, apenas o cenário geral).
    2. O **segundo parágrafo** DEVE conter os **insights práticos**. Traduza o clima em ações diretas para o fazendeiro (ex: "Aproveite a janela sem chuva hoje para aplicar defensivos" ou "Suspenda a irrigação amanhã devido à alta umidade prevista").
- **Fidelidade:** Nunca invente dados climáticos. Use estritamente as informações fornecidas no contexto da mensagem. Se não houver dados suficientes, peça a localização ou a cultura plantada.
"""


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


def call_gemini(message: str, history: list | None = None, contexto_clima: str | None = None) -> str:
    """Chama o Gemini com message, contexto de clima opcional."""
    if not GEMINI_API_KEY:
        return "Erro: GEMINI_API_KEY não configurada. Configure a chave no servidor."

    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(
        "gemini-2.5-flash",
        system_instruction=SYSTEM_INSTRUCTION,
    )

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
