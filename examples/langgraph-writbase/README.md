# LangGraph + WritBase: AI Agent Task Management

A minimal example showing how to connect a [LangGraph](https://langchain-ai.github.io/langgraph/) ReAct agent to [WritBase](https://github.com/Writbase/writbase) via MCP using [`langchain-mcp-adapters`](https://github.com/langchain-ai/langchain-mcp-adapters).

The agent can create, query, and update tasks through natural language -- WritBase handles storage, permissions, and provenance automatically.

## Prerequisites

- Python 3.10+
- A WritBase instance (cloud or self-hosted) with an agent key
- An OpenAI API key (or swap for Anthropic -- see below)

## Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Configure credentials
cp .env.example .env
# Edit .env with your values:
#   WRITBASE_URL       - your WritBase MCP endpoint
#   WRITBASE_AGENT_KEY - an agent key (wb_<key_id>_<secret>)
#   OPENAI_API_KEY     - your OpenAI key
```

## Usage

Run with the default demo prompt (creates a task, lists all tasks):

```bash
python agent.py
```

Or pass a custom prompt:

```bash
python agent.py "What tasks are currently blocked?"
python agent.py "Mark task abc123 as done and add a note saying deployment verified"
```

## Using Anthropic instead of OpenAI

Replace `langchain-openai` with `langchain-anthropic` in `requirements.txt`, then swap the model in `agent.py`:

```python
from langchain_anthropic import ChatAnthropic
model = ChatAnthropic(model="claude-sonnet-4-20250514")
```

Set `ANTHROPIC_API_KEY` instead of `OPENAI_API_KEY` in your `.env`.

## How it works

1. `langchain-mcp-adapters` connects to WritBase's MCP endpoint over streamable-http
2. It discovers available tools (e.g. `get_tasks`, `add_task`, `update_task`, `info`)
3. LangGraph's `create_react_agent` builds a ReAct loop that reasons about when to call which tool
4. The agent authenticates with your agent key on every request -- WritBase enforces workspace isolation and permissions

## Links

- [WritBase](https://github.com/Writbase/writbase) -- agent-first task management
- [LangGraph docs](https://langchain-ai.github.io/langgraph/)
- [langchain-mcp-adapters](https://github.com/langchain-ai/langchain-mcp-adapters)
