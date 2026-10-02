"""LeapBuilder M9.3 — server config that wires oauth2-proxy user auth.

Activate by setting in the runtime environment::

    OPENHANDS_CONFIG_CLS=openhands.app_server.server_config.leapbuilder_config.LeapBuilderServerConfig

Everything else inherits from ``ServerConfig``. The only change is the
``user_auth_class`` default, which is now the oauth2-proxy variant that
reads ``X-Forwarded-Email`` + ``X-Forwarded-Access-Token`` etc.
"""

from openhands.app_server.server_config.server_config import ServerConfig
from openhands.integrations.leapbuilder_llm import register_lb_llm_providers


class LeapBuilderServerConfig(ServerConfig):
    """LeapBuilder defaults: per-user identity sourced from oauth2-proxy."""

    user_auth_class: str = (
        'openhands.app_server.user_auth.oauth2proxy_user_auth.OAuth2ProxyUserAuth'
    )

    def verify_config(self):
        # ServerConfig.verify_config rejects any non-empty OPENHANDS_CONFIG_CLS
        # because the base class doesn't understand a custom config path. We
        # DO understand it — this class IS the custom config — so skip the
        # check.
        #
        # Side-effect: register LeapBuilder custom LLM providers (e.g.
        # the claude-code-sdk wrapper). This runs once at server start.
        register_lb_llm_providers()
        return
