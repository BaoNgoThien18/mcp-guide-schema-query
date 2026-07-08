# MCP Guide Schema Query

Reusable read-only MCP tools/server for projects that need AI tools to understand a database, inspect schema, run safe `SELECT` queries, and read selected source files.

This repo supports both:

- Node/Next.js through npm: `@bugmedia/mcp-guide-schema-query`
- Laravel/PHP through Composer: `bugmedia/mcp-guide-schema-query`

It exposes three MCP tools:

- `database-guide`
- `database-schema`
- `database-select`

Optional codebase tools can be enabled per project:

- `codebase-map`
- `codebase-read`

The Node package includes:

- OAuth flow compatible with Claude Web custom connectors.
- Static token support for Codex or curl.
- Streamable HTTP MCP endpoint handlers.
- PostgreSQL read-only adapter with SQL guardrails.

The Laravel package includes:

- Reusable Laravel MCP `Server` class.
- The same 5 tools: `database-guide`, `database-schema`, `database-select`, `codebase-map`, `codebase-read`.
- MySQL/MariaDB and PostgreSQL schema inspection.
- SQL guardrails and read-only transaction execution.
- Codebase read guardrails.

## Install

### Node / Next.js

```bash
npm install github:BaoNgoThien18/mcp-guide-schema-query
```

### Laravel

In `composer.json`:

```json
{
  "repositories": [
    {
      "type": "vcs",
      "url": "git@github.com:BaoNgoThien18/mcp-guide-schema-query.git"
    }
  ],
  "require": {
    "bugmedia/mcp-guide-schema-query": "dev-main"
  }
}
```

Then:

```bash
composer update bugmedia/mcp-guide-schema-query
php artisan vendor:publish --tag=mcp-guide-schema-query-config
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

## Laravel Usage

Use Laravel MCP for the transport and this package for the reusable server/tools:

```php
// routes/ai.php
use Bugmedia\McpGuideSchemaQuery\Servers\GuideSchemaQueryServer;
use Laravel\Mcp\Facades\Mcp;

Mcp::web('/mcp/kmedia', GuideSchemaQueryServer::class)
    ->middleware(['your-mcp-auth-middleware', 'throttle:30,1']);
```

Recommended config/env:

```env
MCP_SERVER_NAME="Kmedia Production Database"
MCP_DB_CONNECTION=mysql_mcp_readonly
MCP_QUERY_DEFAULT_LIMIT=200
MCP_QUERY_MAX_LIMIT=1000
MCP_STATEMENT_TIMEOUT_MS=15000
MCP_CODEBASE_MAX_FILES=400
MCP_CODEBASE_MAX_READ_BYTES=160000
```

Configure `mysql_mcp_readonly` or `pgsql_mcp_readonly` in `config/database.php` with a database user that only has read privileges.

The package reads guide docs from:

```text
docs/mcp-system-overview.md
docs/mcp-database-map.md
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
- Runs in a read-only transaction.
- Applies statement timeout.
- Adds a limit to plain `SELECT`/`WITH` queries without one.

`codebase-read`:

- Reads only files under the configured `rootDir`.
- Blocks `.env*`, `.git`, `node_modules`, build output, and dependency/vendor folders.
- Applies a read budget so large files cannot flood context.
