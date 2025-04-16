# Model Context Protocol (MCP) Integration

The Nostrify documentation is available through the Model Context Protocol (MCP), which allows AI agents to access and use our documentation directly. This integration enables developers to get assistance from AI tools like GitHub Copilot, VSCode Copilot, and Goose with accurate, up-to-date information about Nostrify.

## What is MCP?

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) is an open standard that allows AI agents to access external tools and data sources. By integrating Nostrify documentation with MCP, AI assistants can:

- Read and understand Nostrify documentation
- Provide accurate guidance on Nostrify usage
- Help troubleshoot issues with accurate context

## Setting Up Nostrify Documentation MCP

### Prerequisites

- [Deno](https://deno.com/) installed on your system
  ```bash
  curl -fsSL https://deno.land/install.sh | sh
  ```

### Server Command

This command should be entered into your MCP client:

```bash
deno run -A jsr:@soapbox/docs-mcp --name Nostrify --site nostrify.dev
```

### Installation Options

#### VSCode Setup

To enable Nostrify documentation for GitHub Copilot in VSCode:

1. Create or edit `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "nostrify": {
      "type": "stdio",
      "command": "deno",
      "args": [
        "run",
        "-A",
        "jsr:@soapbox/docs-mcp",
        "--name",
        "Nostrify",
        "--site",
        "nostrify.dev"
      ]
    }
  }
}
```

2. Restart VSCode or reload the window
3. The Nostrify documentation will now be available to GitHub Copilot

For more information, see [Use MCP servers in VS Code](https://code.visualstudio.com/docs/copilot/chat/mcp-servers).

#### Goose Setup

To install as a [Goose](https://block.github.io/goose/) extension:

1. Run `goose configure`
2. Choose "Add Extension"
3. Choose "Command-line Extension"
4. Enter the project name: `nostrify`
5. Enter the command:
   ```
   deno run -A jsr:@soapbox/docs-mcp --name Nostrify --site nostrify.dev
   ```
6. Save the configuration

After installation, Goose will have access to all Nostrify documentation through the `read_doc` tool.

## Using the MCP

Once installed, AI assistants will gain access to a `read_doc` tool that can fetch and display documentation directly from the Nostrify website. For example:

- "Show me how to connect to a Nostr relay with Nostrify"
- "What storage options are available in Nostrify?"
- "Help me understand Nostrify's policy system"

## For Developers

If you're developing tools that integrate with Nostrify, setting up the MCP can provide your AI assistants with accurate context about our API and functionality, leading to better code suggestions and troubleshooting.

### Development and Testing

You can test the MCP server locally:

```bash
# Install dependencies
deno run -A jsr:@soapbox/docs-mcp --name Nostrify --site nostrify.dev
```

You can also run the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) to debug and interact with the server:

```bash
deno task dev
```

## Contributing

If you find issues with the MCP integration or want to improve it, please consider contributing to the [docs-mcp project](https://github.com/soapbox-pub/docs-mcp).
