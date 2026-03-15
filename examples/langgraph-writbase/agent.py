"""
LangGraph + WritBase: AI Agent Task Management

A LangGraph ReAct agent that manages tasks through WritBase's MCP endpoint.
The agent can create, query, and update tasks using natural language.

Usage:
    cp .env.example .env   # fill in your credentials
    pip install -r requirements.txt
    python agent.py
"""

import asyncio
import os
import sys

from dotenv import load_dotenv
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent


load_dotenv()


def check_env() -> None:
    """Validate that required environment variables are set."""
    required = ["WRITBASE_URL", "WRITBASE_AGENT_KEY", "OPENAI_API_KEY"]
    missing = [v for v in required if not os.environ.get(v)]
    if missing:
        print(f"Error: missing environment variables: {', '.join(missing)}")
        print("Copy .env.example to .env and fill in your credentials.")
        sys.exit(1)


async def run_agent(prompt: str) -> None:
    """Connect to WritBase via MCP and run a ReAct agent with the given prompt."""
    async with MultiServerMCPClient(
        {
            "writbase": {
                "transport": "streamable_http",
                "url": os.environ["WRITBASE_URL"],
                "headers": {
                    "Authorization": f"Bearer {os.environ['WRITBASE_AGENT_KEY']}"
                },
            }
        }
    ) as client:
        tools = client.get_tools()
        if not tools:
            print("Error: no tools returned from WritBase MCP server.")
            print("Check your WRITBASE_URL and WRITBASE_AGENT_KEY.")
            sys.exit(1)

        print(f"Connected to WritBase. Available tools: {[t.name for t in tools]}\n")

        model = ChatOpenAI(model="gpt-4o")
        agent = create_react_agent(model, tools)

        result = await agent.ainvoke({"messages": [{"role": "user", "content": prompt}]})

        # Print the final assistant message
        for msg in result["messages"]:
            if msg.type == "ai" and msg.content:
                print(f"\nAgent: {msg.content}")


async def main() -> None:
    check_env()

    prompt = (
        "Create a task titled 'Review Q1 metrics' with priority high, "
        "then list all tasks and summarize what you see."
    )

    # Override with CLI argument if provided
    if len(sys.argv) > 1:
        prompt = " ".join(sys.argv[1:])

    print(f"Prompt: {prompt}\n")
    await run_agent(prompt)


if __name__ == "__main__":
    asyncio.run(main())
