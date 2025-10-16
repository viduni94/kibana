# Observability Agent (Onechat)

This plugin provides a built-in Observability Agent and RCA-focused tools for Kibana Agent Builder (Onechat).

- Agent ID: `solution.observability.agent`
- Tools:
  - `solution.observability.get_services`
  - `solution.observability.get_service_health`
  - `solution.observability.get_root_cause_candidates`
  - `solution.observability.get_related_logs`
  - `solution.observability.get_deploy_markers`

Enable Agent Builder UI in development:

```yml
uiSettings.overrides:
  agentBuilder:enabled: true
```

The agent and tools are exposed automatically via MCP (`/api/agent_builder/mcp`) and A2A (`/api/agent_builder/a2a`).
