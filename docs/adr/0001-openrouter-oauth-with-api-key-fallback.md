# OpenRouter OAuth with API key fallback

The MVP will try OpenRouter OAuth first for model access and model discovery, while allowing users to fall back to provider API keys for Gemini, OpenAI, Anthropic, or similar providers. This balances user convenience and dynamic model selection against OAuth complexity, while avoiding an app-managed AI backend in the first version.

Discovered models will be exposed through simple task presets by default, with exact model selection kept in advanced settings so interview prep work is not interrupted by model-routing decisions.

Credentials and tokens will only be stored locally after explicit user action, must be removable, and should be presented with clear risk language rather than described as server-grade secret storage. They must stay outside Notebook data and Notebook Export; exports are portable backups of preparation material, not secrets bundles.
