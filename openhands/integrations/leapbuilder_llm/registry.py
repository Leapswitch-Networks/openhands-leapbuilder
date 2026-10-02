"""LeapBuilder LLM provider registry.

Run once at server start-up to register LeapBuilder-flavored LiteLLM
providers. Currently registers:

* ``lb-claude-cli`` — uses the host's installed ``claude`` CLI session
  (via the ``claude-code-sdk`` Python package) instead of an API key.
  Useful for developers who have a Claude subscription but don't want
  to spend on a separate API key.

Gating:

* ``LB_ENABLE_CLAUDE_CODE_SDK=true`` env var must be set.
* The compose file mounts ``~/.claude/`` into the OpenHands container
  *only* in dev (``docker/compose.dev.yml``) — staging/prod don't.
  If the mount is missing, the provider raises a clear error on first
  invocation.

To use from the UI: enter ``lb-claude-cli/sonnet`` (or any other model
slug supported by the host's ``claude`` CLI) as the LLM model string.
No API key needed.
"""

from __future__ import annotations

import logging
import os
import warnings

logger = logging.getLogger(__name__)


def register_lb_llm_providers() -> None:
    """Register LeapBuilder LiteLLM custom providers. Idempotent."""
    if os.environ.get('LB_ENABLE_CLAUDE_CODE_SDK', '').lower() not in (
        '1',
        'true',
        'yes',
    ):
        logger.debug(
            'LB_ENABLE_CLAUDE_CODE_SDK not set — skipping Claude Code SDK '
            'provider registration'
        )
        return

    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        import litellm

    # Lazy-import the handler so we don't pay the claude-code-sdk import
    # cost on every server boot, only when the flag is on.
    from openhands.integrations.leapbuilder_llm.claude_code_sdk_provider import (
        ClaudeCodeSDKLLM,
    )

    # Idempotent: replace any prior entry with our provider key.
    existing = getattr(litellm, 'custom_provider_map', None) or []
    new_map = [entry for entry in existing if entry.get('provider') != 'lb-claude-cli']
    new_map.append({'provider': 'lb-claude-cli', 'custom_handler': ClaudeCodeSDKLLM()})
    litellm.custom_provider_map = new_map
    logger.info('LeapBuilder LLM providers registered: lb-claude-cli (claude-code-sdk)')
