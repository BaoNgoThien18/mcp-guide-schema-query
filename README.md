# MCP Guide Schema Query

Reusable read-only MCP server for Laravel and Node projects.

It exposes five MCP tools:

- `database-guide`: returns a curated Markdown guide for the connected system.
- `database-schema`: returns database tables, columns, indexes, and foreign keys.
- `database-select`: runs bounded read-only SQL.
- `codebase-map`: lists allowed source files from a configured project root.
- `codebase-read`: reads selected allowed source files.

The package does not include project schema, domain names, IPs, database credentials, OAuth secrets, or application data. Each consuming project provides its own guide file, route path, database connection, and secrets.

## Security Model

This package is designed for production MCP access with strict read-only behavior:

- Database tools are marked read-only in MCP annotations.
- SQL execution allows only `SELECT`, `WITH ... SELECT`, `SHOW`, `EXPLAIN`, `DESCRIBE`, and `DESC`.
- SQL execution rejects write, DDL, lock, file, account, replication, and administrative statements.
- SQL execution rejects multiple statements.
- Node PostgreSQL execution runs inside `BEGIN READ ONLY` and rolls back after the query.
- Laravel execution should use a database user with read-only privileges.
- Codebase tools block env files, package auth files, dependency folders, build artifacts, storage folders, and path traversal.
- OAuth authorization requires an internal approval password before issuing an authorization code.

For production, always create a database user with database-level read-only privileges. Application guards are a second layer, not the only protection.

## Claude Web Connector

Use a public HTTPS endpoint that serves the MCP Streamable HTTP route.

Example values:

```text
Name: Project MCP
MCP server URL: https://your-domain.example/mcp/project
OAuth Client ID: mcp-project-client
OAuth Client Secret: leave empty for public PKCE clients, or enter your configured secret if your deployment requires confidential clients
```

The OAuth flow uses these routes:

```text
/.well-known/oauth-protected-resource/mcp/project
/.well-known/oauth-authorization-server/mcp/project
/oauth/mcp/register
/oauth/mcp/authorize
/oauth/mcp/token
```

Claude may dynamically register as a public PKCE client. In that mode, no client secret is returned by the registration endpoint. Access is still gated by the approval password shown during authorization.

## Node Usage

Install:

```bash
npm install @bugmedia/mcp-guide-schema-query
```

Create the MCP server:

```ts
import { createMcpServer, createPostgresAdapter } from "@bugmedia/mcp-guide-schema-query";

export const mcp = createMcpServer({
  serverName: "Project Database",
  path: "/mcp/project",
  publicOrigin: process.env.MCP_PUBLIC_ORIGIN,
  webToken: process.env.MCP_WEB_TOKEN ?? "",
  oauthClientId: process.env.MCP_OAUTH_CLIENT_ID ?? "",
  oauthClientSecret: process.env.MCP_OAUTH_CLIENT_SECRET ?? "",
  oauthApprovalPassword: process.env.MCP_OAUTH_APPROVAL_PASSWORD ?? process.env.MCP_OAUTH_CLIENT_SECRET ?? "",
  oauthSigningKey: process.env.MCP_OAUTH_SIGNING_KEY ?? "",
  guideText: () => readFile("docs/mcp-database-map.md", "utf8"),
  database: createPostgresAdapter({
    connectionString: process.env.MCP_DATABASE_URL ?? "",
    defaultLimit: 200,
    maxLimit: 1000,
    statementTimeoutMs: 15000,
  }),
  codebase: {
    rootDir: process.cwd(),
    maxFiles: 400,
    maxReadBytes: 160000,
  },
});
```

Example Next.js route handlers:

```ts
export const GET = mcp.get;
export const POST = mcp.post;
export const DELETE = mcp.delete;
```

OAuth routes:

```ts
export const GET = mcp.protectedResource;
```

```ts
export const GET = mcp.authorizationServer;
```

```ts
export const POST = mcp.register;
```

```ts
export const GET = mcp.authorize;
export const POST = mcp.authorize;
```

```ts
export const POST = mcp.token;
```

Environment template:

```env
MCP_PUBLIC_ORIGIN=https://your-domain.example
MCP_WEB_TOKEN=change-me
MCP_OAUTH_CLIENT_ID=mcp-project-client
MCP_OAUTH_CLIENT_SECRET=change-me
MCP_OAUTH_APPROVAL_PASSWORD=change-me
MCP_OAUTH_SIGNING_KEY=change-me-long-random-value
MCP_DATABASE_URL=postgres://readonly_user:password@host:5432/database
```

## Laravel Usage

Install:

```bash
composer require bugmedia/mcp-guide-schema-query
```

Publish config:

```bash
php artisan vendor:publish --tag=mcp-guide-schema-query-config
```

Create a guide file:

```text
docs/mcp-database-map.md
```

Recommended guide sections:

- System overview.
- Important business entities.
- Important table relationships.
- Query rules and table naming conventions.
- Sensitive columns that should not be selected unless explicitly needed.
- Recommended query patterns.

Environment template:

```env
MCP_SERVER_NAME="Project Database"
MCP_DB_CONNECTION=mcp_readonly
MCP_QUERY_DEFAULT_LIMIT=200
MCP_QUERY_MAX_LIMIT=1000
MCP_STATEMENT_TIMEOUT_MS=15000
MCP_CODEBASE_MAX_FILES=400
MCP_CODEBASE_MAX_READ_BYTES=160000
```

Use a dedicated read-only database connection in `config/database.php`. The database account should not have `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, or administrative privileges.

## Public Repository Checklist

Before publishing a project that uses this package:

- Do not commit `.env`, database URLs, OAuth tokens, OAuth signing keys, SSH hosts, IP addresses, or customer data.
- Keep project-specific schema and relationship docs inside the private consuming project.
- Use placeholder domains in public examples.
- Use read-only database credentials in production.
- Require an approval password for OAuth authorization.
