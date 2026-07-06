# MCP Guide Schema Query

Reusable read-only MCP server for projects that need AI tools to understand a database, inspect schema, and run safe `SELECT` queries.

It exposes three MCP tools:

- `database-guide`
- `database-schema`
- `database-select`

Optional codebase tools can be enabled per project:

- `codebase-map`
- `codebase-read`

The package includes:

- OAuth flow compatible with Claude Web custom connectors.
- Static token support for Codex or curl.
- Streamable HTTP MCP endpoint handlers.
- PostgreSQL read-only adapter with SQL guardrails.

## Install

```bash
npm install github:BaoNgoThien18/mcp-guide-schema-query
```

## Environment

Use the same values across projects if you want the same Claude connector credentials:

```env
MCP_WEB_TOKEN=
MCP_OAUTH_CLIENT_ID=
MCP_OAUTH_CLIENT_SECRET=
MCP_OAUTH_SIGNING_KEY=
MCP_OAUTH_CODE_TTL=300
MCP_OAUTH_TOKEN_TTL=3600
MCP_QUERY_DEFAULT_LIMIT=200
MCP_QUERY_MAX_LIMIT=1000
DATABASE_URL=
```

## Next.js App Router Usage

Create a shared server file:

```ts
// lib/mcp.ts
import { createMcpServer, createPostgresAdapter } from "@bugmedia/mcp-guide-schema-query";

export const mcp = createMcpServer({
  serverName: "Finance Database",
  path: "/mcp/finance",
  webToken: process.env.MCP_WEB_TOKEN ?? "",
  oauthClientId: process.env.MCP_OAUTH_CLIENT_ID ?? "",
  oauthClientSecret: process.env.MCP_OAUTH_CLIENT_SECRET ?? "",
  oauthSigningKey: process.env.MCP_OAUTH_SIGNING_KEY ?? process.env.JWT_SECRET ?? "",
  guideText: "Describe your system and important joins here.",
  codebase: {
    rootDir: process.cwd(),
    maxFiles: 300,
    maxReadBytes: 120000,
  },
  database: createPostgresAdapter({
    connectionString: process.env.DATABASE_URL ?? "",
    defaultLimit: Number(process.env.MCP_QUERY_DEFAULT_LIMIT ?? "200"),
    maxLimit: Number(process.env.MCP_QUERY_MAX_LIMIT ?? "1000"),
  }),
});
```

MCP route:

```ts
// app/mcp/finance/route.ts
import { mcp } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = mcp.get;
export const POST = mcp.post;
export const DELETE = mcp.delete;
```

OAuth routes:

```ts
// app/.well-known/oauth-protected-resource/[[...path]]/route.ts
import { mcp } from "@/lib/mcp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = mcp.protectedResource;
```

```ts
// app/.well-known/oauth-authorization-server/[[...path]]/route.ts
import { mcp } from "@/lib/mcp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = mcp.authorizationServer;
```

```ts
// app/oauth/mcp/register/route.ts
import { mcp } from "@/lib/mcp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = mcp.register;
```

```ts
// app/oauth/mcp/authorize/route.ts
import { mcp } from "@/lib/mcp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = mcp.authorize;
```

```ts
// app/oauth/mcp/token/route.ts
import { mcp } from "@/lib/mcp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = mcp.token;
```

## Claude Web

Use:

```text
Remote MCP server URL: https://your-domain.com/mcp/finance
OAuth Client ID: MCP_OAUTH_CLIENT_ID
OAuth Client Secret: MCP_OAUTH_CLIENT_SECRET
```

## Codex

Static token URL:

```bash
codex mcp add finance --url 'https://your-domain.com/mcp/finance?token=...'
```

## Safety

`database-select`:

- Rejects multiple statements.
- Blocks DDL/DML/admin commands.
- Runs in `BEGIN READ ONLY`.
- Applies statement timeout.
- Adds a limit to plain `SELECT`/`WITH` queries without one.

`codebase-read`:

- Reads only files under the configured `rootDir`.
- Blocks `.env*`, `.git`, `node_modules`, build output, and dependency/vendor folders.
- Applies a read budget so large files cannot flood context.
