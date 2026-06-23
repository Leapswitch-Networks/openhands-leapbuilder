"""LeapBuilder-specific LiteLLM custom providers.

Importing this module registers the providers with LiteLLM. Import once
at app startup from ``leapbuilder_config.py`` so they're available before
the first ``litellm.completion`` call.
"""

from openhands.integrations.leapbuilder_llm.registry import (  # noqa: F401
    register_lb_llm_providers,
)
