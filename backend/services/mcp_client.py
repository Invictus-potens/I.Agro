"""
Cliente MCP via Streamable HTTP (supergateway expondo stdio → /mcp).
Usado pelo chat para listar e invocar ferramentas do servidor MCP.
"""
from __future__ import annotations

import asyncio
import json
import os
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.types import CallToolResult, Tool


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


async def list_tools_async(
    url: str,
    *,
    timeout_s: float = 60.0,
    read_s: float = 120.0,
) -> list[Tool]:
    async def cb(session: ClientSession) -> list[Tool]:
        res = await session.list_tools()
        return list(res.tools)

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
        result = await session.call_tool(name, arguments=arguments)
        return _format_tool_result(result)

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
