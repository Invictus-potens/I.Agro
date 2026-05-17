"""
Lógica do chat: handler, contexto mínimo e chamada ao Gemini via MCP.
"""
import logging
import re
import unicodedata
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from backend.services import mcp_client

logger = logging.getLogger(__name__)

WEATHER_KEYWORDS = re.compile(
    r"\b(clima|tempo|chuva|chuvas|previs|geada|granizo|vento|temperatura|calor|frio|"
    r"seca|irriga|plantio|colheita|alerta|umidade|garoa|temporal)\b",
    re.IGNORECASE,
)
LIST_CITIES_PATTERN = re.compile(
    r"\b(quais|quantas|lista|listar|tem|existem|cadastrad)\b.*\b(cidade|cidades|local)\b"
    r"|\b(cidade|cidades)\b.*\b(quais|quantas|tem|existem)\b",
    re.IGNORECASE,
)

SYSTEM_PROMPT = """
Você é o I.Agro, assistente de clima para agricultores no Brasil.

## COMO FALAR (OBRIGATÓRIO)
- Linguagem simples, como numa conversa no campo. Evite termos técnicos, siglas e inglês.
- Respostas curtas. Em perguntas gerais, 2 a 4 frases em parágrafos pequenos.
- Quando informar previsão de mais de um dia, NÃO use um parágrafo único: use lista, um item por dia.
  - Comece com uma frase curta citando a cidade.
  - Depois, um item por linha começando com "-", por exemplo:
    - Hoje: calor, máxima 31 °C, mínima 16 °C, chance de chuva.
    - Amanhã: mais fresco, máxima 22 °C, chuva forte.
  - Se fizer sentido, feche com uma linha de dica prática (pulverizar, irrigar, adiar colheita).
- Não cite nomes de campos do banco, APIs, MCP, UV nem textos em inglês. Traduza a situação: "pode chover", "dia de sol", "calor forte".
- Datas: prefira "hoje", "amanhã", "depois de amanhã" ou "dia 16/05", não só 2026-05-16.
- Não invente números; use só o que vier das consultas ao banco.

### CIDADE (MUITO IMPORTANTE)
- Responda SOMENTE para a cidade que o produtor pediu na mensagem atual.
- Se a pergunta não disser a cidade e não houver cidade padrão no contexto, PERGUNTE:
  "De qual cidade você quer saber? Tenho dados para: …" (use a lista [Cidades no banco]).
- Nunca use dados de uma cidade para responder sobre outra (ex.: não fale Serrana quando perguntaram Campinas).
- Se o usuário citar uma cidade, consulte locations por nome antes da previsão.
- Se a cidade não existir no banco, diga quais cidades existem (consulta em locations) — não invente.

### ESCOPO
- Só agricultura, clima e manejo no campo. Fora disso, recuse com educação e convide a perguntar sobre o tempo na lavoura.

### FLUXO OBRIGATÓRIO (FERRAMENTA query) — NUNCA PULE
Para qualquer pergunta sobre clima, tempo, chuva, temperatura ou previsão:

1. PRIMEIRO: chame a ferramenta query com parâmetro sql contendo um SELECT completo.
2. Confirme a cidade (nome na pergunta ou lista em locations).
3. Depois: current_weather (última medição) e forecast_days (date >= "Hoje:" do contexto).
4. SOMENTE DEPOIS: escreva a resposta em português simples.

Regras rígidas:
- Nunca invente números.
- Não diga "vou consultar" — apenas chame a ferramenta.
- A linha "Hoje:" no contexto é a data de referência para forecast_days.date >= hoje.
"""

TZ_BR = ZoneInfo("America/Sao_Paulo")


def _today_br() -> date:
    return datetime.now(TZ_BR).date()


def _normalize_text(value: str) -> str:
    lowered = value.lower().strip()
    decomposed = unicodedata.normalize("NFKD", lowered)
    without_accents = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9\s]", " ", without_accents)


def is_weather_question(message: str) -> bool:
    return bool(WEATHER_KEYWORDS.search(message or ""))


def is_list_cities_question(message: str) -> bool:
    return bool(LIST_CITIES_PATTERN.search(message or ""))


def _location_keys_for_match(norm_name: str) -> list[str]:
    """Chaves de busca por cidade (nome completo e palavras longas)."""
    keys = [norm_name] if norm_name else []
    for word in norm_name.split():
        if len(word) >= 4:
            keys.append(word)
    return keys


def _match_location_in_text(
    text: str,
    locations: list[tuple[int, str]],
) -> tuple[int | None, str | None]:
    norm_message = _normalize_text(text)
    if not norm_message or not locations:
        return None, None

    candidates: list[tuple[int, int, str]] = []
    for loc_id, name in locations:
        norm_name = _normalize_text(name)
        if not norm_name:
            continue
        for key in _location_keys_for_match(norm_name):
            if key and re.search(rf"\b{re.escape(key)}\b", norm_message):
                candidates.append((len(key), loc_id, name))

    if not candidates:
        return None, None
    candidates.sort(key=lambda item: item[0], reverse=True)
    _, loc_id, name = candidates[0]
    return loc_id, name


def match_location_from_message(
    message: str,
    locations: list[tuple[int, str]],
) -> tuple[int | None, str | None]:
    """Retorna (location_id, nome) se a mensagem citar uma cidade cadastrada."""
    return _match_location_in_text(message, locations)


def _iter_user_history_texts(history: list | None) -> list[str]:
    """Textos do usuário no histórico, do mais antigo ao mais recente."""
    texts: list[str] = []
    for msg in history or []:
        role = (msg.get("role") or "").lower()
        if role == "assistant":
            continue
        if role not in ("user", "model"):
            sender = (msg.get("sender") or "").lower()
            if sender in ("ai", "assistant", "model"):
                continue
        content = (msg.get("content") or "").strip()
        if content:
            texts.append(content)
    return texts


def match_location_from_history(
    history: list | None,
    locations: list[tuple[int, str]],
) -> tuple[int | None, str | None]:
    """Última cidade citada pelo usuário no histórico (mensagens mais recentes primeiro)."""
    for text in reversed(_iter_user_history_texts(history)):
        loc_id, name = _match_location_in_text(text, locations)
        if loc_id is not None:
            return loc_id, name
    return None, None


def resolve_query_location_id(
    message: str,
    locations: list[tuple[int, str]],
    default_location_id: int | None,
    history: list | None = None,
) -> int | None:
    """
    Ordem: cidade na mensagem atual → cidade no histórico → location_id do app.
    """
    cited_id, cited_name = match_location_from_message(message, locations)
    if cited_id is not None:
        logger.info(
            "cidade resolvida: id=%s fonte=mensagem nome=%s",
            cited_id,
            cited_name,
        )
        return cited_id

    hist_id, hist_name = match_location_from_history(history, locations)
    if hist_id is not None:
        logger.info(
            "cidade resolvida: id=%s fonte=historico nome=%s",
            hist_id,
            hist_name,
        )
        return hist_id

    if default_location_id is not None:
        logger.info("cidade resolvida: id=%s fonte=app", default_location_id)
    return default_location_id


def message_needs_city_prompt(
    message: str,
    locations: list[tuple[int, str]],
    default_location_id: int | None,
    history: list | None = None,
) -> bool:
    if not is_weather_question(message):
        return False
    if is_list_cities_question(message):
        return False
    # Monitor do app não conta: só mensagem atual ou histórico
    return resolve_query_location_id(message, locations, None, history) is None


def format_locations_for_context(locations: list[tuple[int, str]]) -> str:
    if not locations:
        return "[Cidades no banco]\n(nenhuma localidade cadastrada)"
    lines = ["[Cidades no banco]"]
    for loc_id, name in locations:
        lines.append(f"- id {loc_id}: {name}")
    return "\n".join(lines)


def format_ask_city_message(locations: list[tuple[int, str]]) -> str:
    if locations:
        names = ", ".join(name for _, name in locations)
        return (
            "Para te passar o tempo com segurança, me diga de qual cidade você quer saber. "
            f"Hoje tenho dados para: {names}."
        )
    return (
        "Para te passar o tempo, me diga de qual cidade você quer saber. "
        "Ainda não há cidades cadastradas no sistema."
    )


def history_to_gemini(history: list | None) -> list[dict[str, Any]]:
    """Converte histórico da API/frontend para o formato do Gemini."""
    gemini_history: list[dict[str, Any]] = []
    for msg in history or []:
        role = msg.get("role")
        if role == "assistant":
            role = "model"
        elif role not in ("model", "user"):
            sender = (msg.get("sender") or "").lower()
            role = "model" if sender in ("ai", "assistant", "model") else "user"
        gemini_history.append({"role": role, "parts": [msg.get("content", "")]})
    return gemini_history


def parse_context_hints(contexto_clima: str | None) -> tuple[int | None, str]:
    """Extrai location_id e data 'Hoje' do bloco de contexto."""
    loc_id: int | None = None
    today = _today_br().isoformat()
    if not contexto_clima:
        return loc_id, today
    for line in contexto_clima.splitlines():
        if line.startswith("Hoje:"):
            today = line.split(":", 1)[1].strip() or today
        m = re.search(r"location_id sugerido[^:]*:\s*(\d+)", line, re.I)
        if m:
            loc_id = int(m.group(1))
    return loc_id, today


def build_fallback_query_sql(
    *,
    message: str,
    locations: list[tuple[int, str]],
    location_id: int | None = None,
    today: str | None = None,
    history: list | None = None,
) -> str:
    """SELECT quando o Gemini chama query sem sql ou o backend injeta consulta obrigatória."""
    ref_date = (today or _today_br().isoformat())[:10]
    lid = resolve_query_location_id(message, locations, location_id, history)

    if lid is not None:
        logger.info(
            "fallback clima: location_id=%s (msg=%r)",
            lid,
            (message or "")[:80],
        )
        return (
            f"SELECT l.id, l.name, cw.temp_c, cw.humidity, cw.condition_text, cw.data_hora, "
            f"fd.date, fd.maxtemp_c, fd.mintemp_c, fd.daily_chance_of_rain, fd.condition_text AS forecast_condition "
            f"FROM locations l "
            f"LEFT JOIN LATERAL ("
            f"  SELECT temp_c, humidity, condition_text, data_hora "
            f"  FROM current_weather WHERE location_id = l.id ORDER BY data_hora DESC LIMIT 1"
            f") cw ON true "
            f"LEFT JOIN forecast_days fd ON fd.location_id = l.id AND fd.date >= '{ref_date}' "
            f"WHERE l.id = {int(lid)} "
            f"ORDER BY fd.date NULLS LAST LIMIT 15"
        )
    return "SELECT id, name FROM locations ORDER BY name"


def build_mcp_query_context(
    user_message: str,
    location_id: int | None = None,
    locations: list[tuple[int, str]] | None = None,
    history: list | None = None,
) -> str:
    """Contexto mínimo sem dados de clima — tudo deve vir da ferramenta query (MCP)."""
    locs = locations or []
    parts = [
        f"Hoje: {_today_br().isoformat()}",
        "ATENÇÃO: este bloco NÃO contém clima. Use a ferramenta query com sql para buscar dados.",
        f"Pergunta do usuário: {user_message[:500]}",
    ]

    cited_id, cited_name = match_location_from_message(user_message, locs)
    if cited_id is not None:
        parts.append(f"Cidade citada na pergunta (usar nas consultas): {cited_name} (id {cited_id})")
    else:
        hist_id, hist_name = match_location_from_history(history, locs)
        if hist_id is not None:
            parts.append(
                f"Cidade do histórico da conversa (usar nas consultas): {hist_name} (id {hist_id})"
            )
        elif location_id is not None:
            parts.append(
                f"Cidade padrão do app (use só se a pergunta não citar outra cidade): "
                f"location_id {location_id}"
            )
        else:
            parts.append(
                "Nenhuma cidade na pergunta nem no histórico — peça ao produtor qual cidade, "
                "ou liste as opções de [Cidades no banco]."
            )

    if locations:
        parts.append(format_locations_for_context(locations))

    return "\n".join(parts)


def call_gemini(
    message: str,
    history: list | None = None,
    contexto_clima: str | None = None,
    *,
    location_id: int | None = None,
) -> str:
    """Chama o Gemini exclusivamente via MCP (ferramenta query)."""
    mcp_url = mcp_client.mcp_url_from_env()
    if not mcp_url:
        return (
            "Não foi possível consultar o banco: servidor MCP não configurado "
            "(MCP_SERVER_URL). Tente novamente mais tarde."
        )
    try:
        from backend.gemini_mcp import run_gemini_with_mcp_tools

        return run_gemini_with_mcp_tools(
            message=message,
            history=history,
            contexto_clima=contexto_clima,
            system_instruction=SYSTEM_PROMPT,
            mcp_url=mcp_url,
            location_id=location_id,
        )
    except Exception as e:
        logger.warning("Fluxo MCP+Gemini falhou: %s", e, exc_info=True)
        return (
            "Não consegui consultar os dados no banco agora. "
            "Verifique se o serviço MCP está no ar e tente de novo."
        )


def handle_chat(
    message: str,
    history: list | None = None,
    location_id: int | None = None,
) -> str:
    """
    Handler principal: contexto mínimo + Gemini via MCP.
    Clima e cidades vêm só da ferramenta query (MCP).
    """
    msg = (message or "").strip()
    if not msg:
        return "Envie uma mensagem para continuar."
    if len(msg) > 4000:
        return "Mensagem muito longa. Resuma em até 4000 caracteres."

    return call_gemini(
        msg,
        history=history or [],
        contexto_clima=None,
        location_id=location_id,
    )
