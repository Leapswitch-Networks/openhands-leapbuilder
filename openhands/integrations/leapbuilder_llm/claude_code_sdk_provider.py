"""LiteLLM custom provider wrapping the ``claude-code-sdk`` Python SDK.

Maps OpenAI-style ``messages=[...]`` chat-completion calls onto the
``ClaudeSDKClient`` session API. Used by LeapBuilder when the developer
prefers their host's Claude CLI subscription auth over a separate
Anthropic API key.

The provider is registered as ``lb-claude-cli`` — use model strings like
``lb-claude-cli/sonnet`` or ``lb-claude-cli/opus`` from the UI.

Limitations (v1):
* Non-streaming completion only. Streaming arrives in a follow-up.
* The model slug (the part after the ``/``) is passed through to the SDK
  as-is — the SDK decides which Claude model to actually invoke based on
  the host's CLI config.
* Tool-use / function-calling not threaded through yet; LeapBuilder
  scaffolding still works because OpenHands' tool calls are routed
  through its own agent loop, not through LiteLLM's tool plumbing.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Any

import litellm
from litellm.types.utils import (
    Choices,
    Message,
    ModelResponse,
    Usage,
)

logger = logging.getLogger(__name__)


def _messages_to_prompt(messages: list[dict[str, Any]]) -> tuple[str, str]:
    """Collapse an OpenAI-style message list into (system, user) prompts.

    Returns the first system message and a single user prompt that
    threads the conversation. Good enough for v1 — claude-code-sdk
    handles long sessions natively via repeated ``query`` calls, which
    we'll wire in a streaming follow-up.
    """
    system_parts: list[str] = []
    history_parts: list[str] = []
    for msg in messages:
        role = msg.get('role', 'user')
        content = msg.get('content', '')
        if isinstance(content, list):
            content = ' '.join(
                part.get('text', '') if isinstance(part, dict) else str(part)
                for part in content
            )
        if role == 'system':
            system_parts.append(str(content))
        else:
            history_parts.append(f'{role.upper()}: {content}')
    return ('\n\n'.join(system_parts), '\n\n'.join(history_parts))


async def _run_query(system: str, prompt: str) -> tuple[str, dict[str, int]]:
    """Send the prompt to claude-code-sdk, collect the full response.

    Returns (text, usage_dict). Raises on auth / connection failures
    so LiteLLM surfaces them through its normal error path.
    """
    try:
        from claude_code_sdk import ClaudeAgentOptions, ClaudeSDKClient
    except ImportError as exc:  # pragma: no cover — exercised by smoke tests
        raise RuntimeError(
            'claude-code-sdk is not installed in the OpenHands image. Either '
            "add it to the fork's pyproject.toml or unset "
            'LB_ENABLE_CLAUDE_CODE_SDK to fall back to API-key providers.'
        ) from exc

    options = ClaudeAgentOptions(system_prompt=system or None)
    chunks: list[str] = []
    usage = {'prompt_tokens': 0, 'completion_tokens': 0}

    async with ClaudeSDKClient(options=options) as client:
        await client.query(prompt)
        async for message in client.receive_response():
            text = getattr(message, 'text', None)
            if text:
                chunks.append(text)
            # claude-code-sdk message objects may carry usage_metadata
            # on a 'result' message at the end of the stream.
            meta = getattr(message, 'usage', None) or getattr(
                message, 'usage_metadata', None
            )
            if meta:
                usage['prompt_tokens'] = (
                    getattr(meta, 'input_tokens', None)
                    or meta.get('input_tokens', usage['prompt_tokens'])
                    if isinstance(meta, dict)
                    else getattr(meta, 'input_tokens', usage['prompt_tokens'])
                )
                usage['completion_tokens'] = (
                    getattr(meta, 'output_tokens', None)
                    or meta.get('output_tokens', usage['completion_tokens'])
                    if isinstance(meta, dict)
                    else getattr(meta, 'output_tokens', usage['completion_tokens'])
                )

    return ('\n'.join(chunks).strip(), usage)


class ClaudeCodeSDKLLM(litellm.CustomLLM):
    """LiteLLM custom-LLM bridge to claude-code-sdk."""

    def completion(  # type: ignore[override]
        self,
        model: str,
        messages: list[dict[str, Any]],
        api_base: str | None = None,
        custom_prompt_dict: dict[str, Any] | None = None,
        model_response: ModelResponse | None = None,
        print_verbose: Any = None,
        encoding: Any = None,
        api_key: str | None = None,
        logging_obj: Any = None,
        optional_params: dict[str, Any] | None = None,
        acompletion: bool | None = None,
        litellm_params: dict[str, Any] | None = None,
        logger_fn: Any = None,
        headers: dict[str, Any] | None = None,
        timeout: float | None = None,
        client: Any = None,
        **kwargs: Any,
    ) -> ModelResponse:
        del (
            api_base,
            custom_prompt_dict,
            print_verbose,
            encoding,
            api_key,
            logging_obj,
            optional_params,
            acompletion,
            litellm_params,
            logger_fn,
            headers,
            timeout,
            client,
            kwargs,
        )

        system, prompt = _messages_to_prompt(messages)
        text, usage = asyncio.run(_run_query(system, prompt))

        response = model_response or ModelResponse()
        response.id = f'chatcmpl-lb-{uuid.uuid4().hex[:24]}'
        response.created = int(time.time())
        response.model = model
        response.object = 'chat.completion'
        response.choices = [
            Choices(
                finish_reason='stop',
                index=0,
                message=Message(role='assistant', content=text or ''),
            )
        ]
        response.usage = Usage(
            prompt_tokens=usage['prompt_tokens'],
            completion_tokens=usage['completion_tokens'],
            total_tokens=usage['prompt_tokens'] + usage['completion_tokens'],
        )
        return response
