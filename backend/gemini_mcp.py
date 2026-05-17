"""
Gemini com function calling orquestrado contra um servidor MCP (Streamable HTTP).
"""
from __future__ import annotations

import copy
import logging
import os
from typing import Any

import google.generativeai as genai
from google.generativeai import protos
from google.generativeai.types import FunctionDeclaration
from google.generativeai.types import generation_types
from google.protobuf.json_format import MessageToDict
from mcp import ClientSession
from mcp.types import Tool

from backend.chat import (
    build_fallback_query_sql,
    build_mcp_query_context,
    format_ask_city_message,
    history_to_gemini,
    is_weather_question,
    message_needs_city_prompt,
    parse_context_hints,
    resolve_query_location_id,
)
from backend.services import mcp_client

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 8
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")
MCP_FORCE_QUERY_NUDGE = (
    'Obrigatório: function_call query com JSON {"sql": "SELECT ..."}. '
    'Exemplo: {"sql": "SELECT id, name FROM locations ORDER BY name"}. '
    "Use o [Schema do banco] do contexto para montar o SELECT."
)
MCP_USER_TOOL_FIRST = (
    'Use a tool query com parâmetro sql (SELECT completo). '
    "O schema real está em [Schema do banco] no contexto."
)
MCP_SYSTEM_SUFFIX = """
### BANCO (tool query)
- Parâmetro obrigatório: sql (string com SELECT).
- Use o bloco [Schema do banco] do contexto para colunas corretas.
- Tempo atual: current_weather ORDER BY data_hora DESC LIMIT 1 por location_id.
- Previsão: forecast_days com date >= "Hoje:" do contexto.
"""


def _tool_input_schema(t: Tool) -> dict[str, Any]:
    raw = getattr(t, "inputSchema", None)
    if raw is None:
        d: dict[str, Any] = {"type": "object", "properties": {}}
    elif isinstance(raw, dict):
        d = copy.deepcopy(raw)
    elif hasattr(raw, "model_dump"):
        d = raw.model_dump(mode="json", exclude_none=True)
    else:
        d = {}
    d.pop("$schema", None)
    if "type" not in d and d.get("properties"):
        d["type"] = "object"
    if t.name == mcp_client.QUERY_TOOL:
        d.setdefault("properties", {}).setdefault(
            mcp_client.SQL_ARG,
            {"type": "string", "description": "Consulta SQL SELECT"},
        )
        d["required"] = [mcp_client.SQL_ARG]
    return d


def _mcp_tools_to_declarations(tools: list[Tool]) -> list[FunctionDeclaration]:
    decls: list[FunctionDeclaration] = []
    for t in tools:
        desc = (t.description or f"Ferramenta MCP `{t.name}`.").strip()
        if t.name == mcp_client.QUERY_TOOL:
            desc = (
                f"{desc} Envie sempre sql com SELECT. "
                'Exemplo: {"sql": "SELECT id, name FROM locations LIMIT 5"}'
            )
        if len(desc) > 4090:
            desc = desc[:4087] + "..."
        decls.append(
            FunctionDeclaration(
                name=t.name,
                description=desc,
                parameters=_tool_input_schema(t),
            )
        )
    return decls


def _function_call_args_dict(fc: protos.FunctionCall) -> dict[str, Any]:
    if fc.args is None:
        return {}
    try:
        out = MessageToDict(fc.args, preserving_proto_field_name=True)
        if out:
            return dict(out)
    except Exception:
        pass
    try:
        out = MessageToDict(fc.args)
        if out:
            return dict(out)
    except Exception:
        pass
    try:
        fields = getattr(fc.args, "fields", None)
        if fields:
            parsed: dict[str, Any] = {}
            for key, value in fields.items():
                if hasattr(value, "string_value") and value.string_value:
                    parsed[key] = value.string_value
                elif hasattr(value, "number_value"):
                    parsed[key] = value.number_value
            if parsed:
                return parsed
    except Exception:
        pass
    logger.warning("function_call sem args parseáveis: name=%s", fc.name)
    return {}


def _extract_function_calls(
    response: generation_types.GenerateContentResponse,
) -> list[protos.FunctionCall]:
    if not response.candidates:
        return []
    parts = response.candidates[0].content.parts
    return [p.function_call for p in parts if p.function_call and p.function_call.name]


def _extract_text(response: generation_types.GenerateContentResponse) -> str:
    if not response.candidates:
        return ""
    texts: list[str] = []
    for p in response.candidates[0].content.parts:
        if p.text:
            texts.append(p.text)
    return "\n".join(texts).strip()


def _query_call_succeeded(payload: dict[str, Any]) -> bool:
    return not payload.get("error")


def _resolve_query_args(
    *,
    message: str,
    locations: list[tuple[int, str]],
    contexto_clima: str | None,
    location_id: int | None,
    history: list | None = None,
) -> tuple[dict[str, Any], bool]:
    """SELECT mínimo quando o Gemini chama query sem sql."""
    _, today = parse_context_hints(contexto_clima)
    fallback_sql = build_fallback_query_sql(
        message=message,
        locations=locations,
        location_id=location_id,
        today=today,
        history=history,
    )
    logger.info("query sem sql do Gemini; fallback backend")
    return {mcp_client.SQL_ARG: fallback_sql}, True


async def _run_fallback_weather_query(
    session: ClientSession,
    *,
    message: str,
    locations: list[tuple[int, str]],
    contexto_clima: str | None,
    location_id: int | None,
    history: list | None,
) -> dict[str, Any] | None:
    """Consulta MCP obrigatória quando o Gemini não chama query mas há cidade resolvida."""
    if not is_weather_question(message):
        return None
    if resolve_query_location_id(message, locations, location_id, history) is None:
        return None

    _, today = parse_context_hints(contexto_clima)
    sql = build_fallback_query_sql(
        message=message,
        locations=locations,
        location_id=location_id,
        today=today,
        history=history,
    )
    args = {mcp_client.SQL_ARG: sql}
    try:
        raw = await mcp_client.call_tool_on_session(session, mcp_client.QUERY_TOOL, args)
        if not _query_call_succeeded(raw):
            return None
        logger.info(
            "MCP tools/call (fallback_sem_function_call): query sql=%s",
            sql[:200],
        )
        return mcp_client.tool_result_to_jsonable(raw)
    except Exception as e:
        logger.warning("fallback_sem_function_call falhou: %s", e, exc_info=True)
        return None


async def _run_gemini_chat(session: ClientSession, **kwargs: Any) -> str:
    message: str = kwargs["message"]
    history: list | None = kwargs["history"]
    contexto_clima: str | None = kwargs["contexto_clima"]
    system_instruction: str = kwargs["system_instruction"]
    location_id: int | None = kwargs.get("location_id")

    mcp_tools = await mcp_client.list_tools_on_session(session)
    if not mcp_tools:
        raise RuntimeError("Servidor MCP não expôs ferramentas")

    locations = await mcp_client.fetch_locations_list(session)
    contexto_clima = build_mcp_query_context(
        message,
        location_id=location_id,
        locations=locations,
        history=history,
    )

    if message_needs_city_prompt(message, locations, location_id, history):
        return format_ask_city_message(locations)

    schema_block = await mcp_client.fetch_schema_summary(session)
    if schema_block:
        contexto_clima = f"{contexto_clima}\n\n{schema_block}"
        logger.info("Schema prefetch OK (%d chars)", len(schema_block))

    declarations = _mcp_tools_to_declarations(mcp_tools)
    full_system = f"{system_instruction}{MCP_SYSTEM_SUFFIX}"

    genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))
    model = genai.GenerativeModel(
        model_name=MODEL_NAME,
        system_instruction=full_system,
    )

    user_content = message
    if contexto_clima:
        user_content = (
            f"{MCP_USER_TOOL_FIRST}\n"
            f"[Contexto da consulta]\n{contexto_clima}\n\n"
            f"Pergunta: {message}"
        )

    chat = model.start_chat(
        history=history_to_gemini(history),
        enable_automatic_function_calling=False,
    )

    response = chat.send_message(
        user_content,
        tools=declarations,
        request_options={"timeout": 120},
    )

    tool_calls_made = 0
    nudged_without_tools = False
    weather_data_fetched = False

    for _round_i in range(MAX_TOOL_ROUNDS):
        fcs = _extract_function_calls(response)
        if not fcs:
            text = _extract_text(response)
            if text and tool_calls_made > 0:
                return text
            if tool_calls_made == 0 and not nudged_without_tools:
                nudged_without_tools = True
                logger.info("Gemini respondeu sem MCP; exigindo consulta query")
                response = chat.send_message(
                    MCP_FORCE_QUERY_NUDGE,
                    tools=declarations,
                    request_options={"timeout": 120},
                )
                continue
            if tool_calls_made == 0:
                if not weather_data_fetched:
                    payload = await _run_fallback_weather_query(
                        session,
                        message=message,
                        locations=locations,
                        contexto_clima=contexto_clima,
                        location_id=location_id,
                        history=history,
                    )
                    if payload is not None:
                        weather_data_fetched = True
                        tool_calls_made += 1
                        response = chat.send_message(
                            protos.Content(
                                role="user",
                                parts=[
                                    protos.Part(
                                        function_response=protos.FunctionResponse(
                                            name=mcp_client.QUERY_TOOL,
                                            response=payload,
                                        )
                                    )
                                ],
                            ),
                            tools=declarations,
                            request_options={"timeout": 120},
                        )
                        continue
                return (
                    "Não consegui consultar o banco de dados para responder. "
                    "Tente reformular a pergunta sobre sua cidade."
                )
            if text:
                return text
            fr = response.candidates[0].finish_reason if response.candidates else None
            if tool_calls_made > 0:
                return (
                    "Recebi os dados do banco, mas não consegui montar a resposta agora. "
                    "Pode repetir a pergunta?"
                )
            return format_ask_city_message(locations)

        fr_parts: list[protos.Part] = []
        for fc in fcs:
            args = _function_call_args_dict(fc)
            used_fallback = False
            validation_err = mcp_client.validate_query_tool(fc.name, args)
            if (
                validation_err
                and fc.name == mcp_client.QUERY_TOOL
                and not weather_data_fetched
            ):
                args, used_fallback = _resolve_query_args(
                    message=message,
                    locations=locations,
                    contexto_clima=contexto_clima,
                    location_id=location_id,
                    history=history,
                )
                validation_err = mcp_client.validate_query_tool(fc.name, args)
            elif validation_err and fc.name == mcp_client.QUERY_TOOL and weather_data_fetched:
                validation_err = (
                    "Consulta já realizada neste turno. Use os dados recebidos para responder."
                )

            sql_preview = (args.get(mcp_client.SQL_ARG) or "")[:200]
            if validation_err:
                logger.warning(
                    "query inválida: %s | args=%s",
                    validation_err[:120],
                    args,
                )
                payload = mcp_client.query_validation_error(validation_err)
            else:
                try:
                    raw = await mcp_client.call_tool_on_session(session, fc.name, args)
                    if fc.name == mcp_client.QUERY_TOOL and _query_call_succeeded(raw):
                        tool_calls_made += 1
                        sql_used = (args.get(mcp_client.SQL_ARG) or "").lower()
                        if "from locations" in sql_used and "forecast_days" in sql_used:
                            weather_data_fetched = True
                    tag = "fallback" if used_fallback else "gemini"
                    logger.info(
                        "MCP tools/call (%s): %s sql=%s",
                        tag,
                        fc.name,
                        sql_preview,
                    )
                    payload = mcp_client.tool_result_to_jsonable(raw)
                except Exception as e:
                    logger.warning("MCP call_tool falhou: %s", e, exc_info=True)
                    payload = {"error": True, "message": str(e)[:500]}
            fr_parts.append(
                protos.Part(
                    function_response=protos.FunctionResponse(name=fc.name, response=payload)
                )
            )

        response = chat.send_message(
            protos.Content(role="user", parts=fr_parts),
            tools=declarations,
            request_options={"timeout": 120},
        )

    if tool_calls_made == 0:
        return (
            "Não consegui consultar o banco de dados para responder. "
            "Tente reformular a pergunta sobre o tempo na sua cidade."
        )
    return "Limite de chamadas às ferramentas MCP foi atingido; tente simplificar a pergunta."


def run_gemini_with_mcp_tools(
    *,
    message: str,
    history: list | None,
    contexto_clima: str | None,
    system_instruction: str,
    mcp_url: str,
    location_id: int | None = None,
) -> str:
    """Chat com ferramentas MCP; exige pelo menos um tools/call bem-sucedido antes da resposta final."""
    return mcp_client.with_mcp(
        mcp_url,
        lambda session: _run_gemini_chat(
            session,
            message=message,
            history=history,
            contexto_clima=contexto_clima,
            system_instruction=system_instruction,
            location_id=location_id,
        ),
    )
