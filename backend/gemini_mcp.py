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
from mcp.types import Tool

from backend.services import mcp_client

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 8
MODEL_NAME = "gemini-2.0-flash"
MCP_SYSTEM_SUFFIX = (
    " Quando fizer sentido, use as ferramentas MCP conectadas ao banco para dados "
    "estruturados (prefira SELECT). Não invente nomes de tabelas ou colunas sem "
    "confirmar no schema."
)


def _history_to_gemini(history: list | None) -> list[dict[str, Any]]:
    gemini_history: list[dict[str, Any]] = []
    for msg in history or []:
        role = "model" if msg.get("role") == "assistant" else "user"
        gemini_history.append({"role": role, "parts": [msg.get("content", "")]})
    return gemini_history


def _tool_input_schema(t: Tool) -> dict[str, Any]:
    raw = getattr(t, "inputSchema", None)
    if raw is None:
        return {"type": "object", "properties": {}}
    if isinstance(raw, dict):
        d = copy.deepcopy(raw)
    elif hasattr(raw, "model_dump"):
        d = raw.model_dump(mode="json", exclude_none=True)
    else:
        d = {}
    d.pop("$schema", None)
    if "type" not in d and d.get("properties"):
        d["type"] = "object"
    return d


def _mcp_tools_to_declarations(tools: list[Tool]) -> list[FunctionDeclaration]:
    decls: list[FunctionDeclaration] = []
    for t in tools:
        desc = (t.description or f"Ferramenta MCP `{t.name}`.").strip()
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
        return MessageToDict(fc.args)
    except Exception:
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


def run_gemini_with_mcp_tools(
    *,
    message: str,
    history: list | None,
    contexto_clima: str | None,
    system_instruction: str,
    mcp_url: str,
) -> str:
    """Uma rodada de chat com ferramentas MCP (lista dinâmica) e loop manual function_call."""
    mcp_tools = mcp_client.list_tools(mcp_url)
    if not mcp_tools:
        raise RuntimeError("Servidor MCP não expôs ferramentas")

    declarations = _mcp_tools_to_declarations(mcp_tools)
    full_system = f"{system_instruction}{MCP_SYSTEM_SUFFIX}"

    genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))
    model = genai.GenerativeModel(
        model_name=MODEL_NAME,
        system_instruction=full_system,
    )

    user_content = message
    if contexto_clima:
        user_content = f"Contexto do clima:\n{contexto_clima}\n\nPergunta: {message}"

    chat = model.start_chat(
        history=_history_to_gemini(history),
        enable_automatic_function_calling=False,
    )

    response = chat.send_message(
        user_content,
        tools=declarations,
        request_options={"timeout": 120},
    )

    for round_i in range(MAX_TOOL_ROUNDS):
        fcs = _extract_function_calls(response)
        if not fcs:
            text = _extract_text(response)
            if text:
                return text
            fr = response.candidates[0].finish_reason if response.candidates else None
            return f"Resposta vazia do modelo (finish_reason={fr})."

        fr_parts: list[protos.Part] = []
        for fc in fcs:
            args = _function_call_args_dict(fc)
            try:
                raw = mcp_client.call_tool(fc.name, args, url=mcp_url)
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

    return "Limite de chamadas às ferramentas MCP foi atingido; tente simplificar a pergunta."
