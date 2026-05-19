"""
Cliente MCP via Streamable HTTP (supergateway expondo stdio → /mcp).
Usado pelo chat para listar e invocar ferramentas do servidor MCP.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import logging
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

logger = logging.getLogger(__name__)
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.types import CallToolResult, Tool

QUERY_TOOL = "query"
SQL_ARG = "sql"
_SELECT_RE = re.compile(r"^\s*select\b", re.IGNORECASE)

SCHEMA_SQL = """
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('locations', 'current_weather', 'forecast_days', 'forecast_hours')
ORDER BY table_name, ordinal_position
""".strip()

LOCATIONS_SQL = "SELECT id, name FROM locations ORDER BY name"


def normalize_mcp_url(url: str) -> str:
    """Garante URL absoluta terminando em /mcp (endpoint padrão do supergateway)."""
    u = (url or "").strip().rstrip("/")
    if not u:
        return ""
    if u.endswith("/mcp"):
        return u
    return f"{u}/mcp"


def mcp_url_from_env() -> str:
    return normalize_mcp_url(os.getenv("MCP_SERVER_URL", "").strip())


def validate_query_tool(name: str, arguments: dict[str, Any]) -> str | None:
    """Retorna mensagem de erro em PT ou None se válido."""
    if name != QUERY_TOOL:
        return None
    sql = (arguments.get(SQL_ARG) or "").strip()
    if not sql:
        return (
            "A ferramenta query exige o parâmetro sql com um SELECT completo. "
            'Exemplo: {"sql": "SELECT id, name FROM locations LIMIT 5"}'
        )
    if not _SELECT_RE.match(sql):
        return "Apenas consultas SELECT são permitidas na ferramenta query."
    return None


def query_validation_error(message: str) -> dict[str, Any]:
    return {"error": True, "message": message, "output": message}


def _format_tool_result(result: CallToolResult) -> dict[str, Any]:
    texts: list[str] = []
    for block in result.content:
        if hasattr(block, "text") and block.text:
            texts.append(block.text)
    payload = "\n".join(texts) if texts else ""
    out: dict[str, Any] = {"output": payload}
    if result.structuredContent:
        out["structured"] = result.structuredContent
    if result.isError:
        out["error"] = True
    return out


async def _with_session(
    url: str,
    callback: Callable[[ClientSession], Awaitable[Any]],
    timeout_s: float,
    read_s: float,
) -> Any:
    timeout = httpx.Timeout(timeout_s, read=read_s)
    async with httpx.AsyncClient(timeout=timeout) as http_client:
        async with streamable_http_client(url, http_client=http_client) as (
            read_stream,
            write_stream,
            _get_session_id,
        ):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                return await callback(session)


async def call_tool_on_session(
    session: ClientSession,
    name: str,
    arguments: dict[str, Any],
) -> dict[str, Any]:
    err = validate_query_tool(name, arguments)
    if err:
        return query_validation_error(err)
    result = await session.call_tool(name, arguments=arguments)
    return _format_tool_result(result)


async def list_tools_on_session(session: ClientSession) -> list[Tool]:
    res = await session.list_tools()
    return list(res.tools)


async def fetch_locations_list(session: ClientSession) -> list[tuple[int, str]]:
    """Lista cidades via MCP para resolver nome citado na pergunta."""
    raw = await call_tool_on_session(session, QUERY_TOOL, {SQL_ARG: LOCATIONS_SQL})
    if raw.get("error"):
        logger.warning("Prefetch de locations falhou: %s", (raw.get("message") or "")[:200])
        return []
    output = (raw.get("output") or "").strip()
    if not output:
        return []
    try:
        rows = json.loads(output)
        if not isinstance(rows, list):
            return []
        out: list[tuple[int, str]] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            rid = row.get("id")
            name = row.get("name")
            if rid is not None and name:
                out.append((int(rid), str(name)))
        return out
    except (json.JSONDecodeError, TypeError, ValueError) as e:
        logger.warning("Não foi possível parsear locations: %s", e)
        return []


async def fetch_schema_summary(session: ClientSession) -> str:
    """Busca schema via MCP (backend); injeta no contexto do Gemini."""
    raw = await call_tool_on_session(session, QUERY_TOOL, {SQL_ARG: SCHEMA_SQL})
    if raw.get("error"):
        logger.warning("Prefetch de schema falhou: %s", (raw.get("message") or "")[:200])
        return ""
    output = (raw.get("output") or "").strip()
    if not output:
        return ""
    if len(output) > 8000:
        output = output[:7997] + "..."
    return f"[Schema do banco (colunas reais)]\n{output}"


def with_mcp(
    url: str,
    callback: Callable[[ClientSession], Awaitable[Any]],
    *,
    timeout_s: float = 60.0,
    read_s: float = 120.0,
) -> Any:
    """Uma sessão MCP por chamada (ex.: um POST /api/chat)."""
    u = normalize_mcp_url(url)
    if not u:
        raise ValueError("MCP_SERVER_URL não configurada")
    return asyncio.run(_with_session(u, callback, timeout_s, read_s))


async def list_tools_async(
    url: str,
    *,
    timeout_s: float = 60.0,
    read_s: float = 120.0,
) -> list[Tool]:
    async def cb(session: ClientSession) -> list[Tool]:
        return await list_tools_on_session(session)

    return await _with_session(url, cb, timeout_s, read_s)


async def call_tool_async(
    url: str,
    name: str,
    arguments: dict[str, Any],
    *,
    timeout_s: float = 60.0,
    read_s: float = 120.0,
) -> dict[str, Any]:
    async def cb(session: ClientSession) -> dict[str, Any]:
        return await call_tool_on_session(session, name, arguments)

    return await _with_session(url, cb, timeout_s, read_s)


def list_tools(url: str | None = None) -> list[Tool]:
    """Síncrono: lista ferramentas do servidor MCP."""
    u = normalize_mcp_url(url or mcp_url_from_env())
    if not u:
        raise ValueError("MCP_SERVER_URL não configurada")
    return asyncio.run(list_tools_async(u))


def call_tool(
    name: str,
    arguments: dict[str, Any],
    *,
    url: str | None = None,
) -> dict[str, Any]:
    """Síncrono: executa tools/call no servidor MCP."""
    u = normalize_mcp_url(url or mcp_url_from_env())
    if not u:
        raise ValueError("MCP_SERVER_URL não configurada")
    return asyncio.run(call_tool_async(u, name, arguments))


def tool_result_to_jsonable(d: dict[str, Any]) -> dict[str, Any]:
    """Garante valores serializáveis para FunctionResponse.response (dict aninhado)."""
    try:
        json.dumps(d, default=str)
        return d
    except TypeError:
        return {"output": json.dumps(d, default=str)}
