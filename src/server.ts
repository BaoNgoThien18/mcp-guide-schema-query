import crypto from "node:crypto";
import { codebaseMap, codebaseRead } from "./codebase.js";
import { makeToken, pkceChallenge, timingSafeEqual, verifyToken } from "./oauth.js";
import type { JsonRpcRequest, McpServerConfig } from "./types.js";

const toolNames = ["database-guide", "database-schema", "database-select", "codebase-map", "codebase-read"] as const;

export function createMcpServer(config: McpServerConfig) {
  const normalized = {
    ...config,
    serverVersion: config.serverVersion ?? "1.0.0",
    oauthCodeTtl: config.oauthCodeTtl ?? 300,
    oauthTokenTtl: config.oauthTokenTtl ?? 3600,
    defaultLimit: config.defaultLimit ?? 200,
    maxLimit: config.maxLimit ?? 1000,
    supportedProtocolVersions: config.supportedProtocolVersions ?? ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"],
  };

  const tools: Array<Record<string, unknown>> = [
    {
      name: "database-guide",
      title: "Database Guide Tool",
      description: "Read system overview, important database relationships, query rules, sensitive-column rules, and recommended query patterns.",
      inputSchema: { type: "object" },
      annotations: { readOnlyHint: true },
    },
    {
      name: "database-schema",
      title: "Database Schema Tool",
      description: "Inspect the read-only database schema. Returns tables, columns, indexes, and foreign keys.",
      inputSchema: {
        type: "object",
        properties: {
          table: { type: ["string", "null"], description: "Optional table name. Omit to inspect every table." },
          include_columns: { type: ["boolean", "null"], description: "Include columns. Defaults to true." },
          include_indexes: { type: ["boolean", "null"], description: "Include indexes. Defaults to true." },
          include_foreign_keys: { type: ["boolean", "null"], description: "Include foreign keys. Defaults to true." },
        },
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "database-select",
      title: "Database Select Tool",
      description: "Run a free-form read-only SQL query. Allowed statements: SELECT, WITH ... SELECT, SHOW, EXPLAIN, DESCRIBE, DESC.",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "Read-only SQL query. Use SELECT/SHOW/EXPLAIN/DESCRIBE only." },
          limit: { type: ["integer", "null"], description: `Maximum rows. Defaults to ${normalized.defaultLimit}, max ${normalized.maxLimit}.` },
        },
      },
      annotations: { readOnlyHint: true },
    },
  ];

  if (normalized.codebase) {
    tools.push(
      {
        name: "codebase-map",
        title: "Codebase Map Tool",
        description:
          "List important source files in the configured codebase root. Use this before reading files to understand project structure.",
        inputSchema: { type: "object" },
        annotations: { readOnlyHint: true },
      },
      {
        name: "codebase-read",
        title: "Codebase Read Tool",
        description:
          "Read selected source files from the configured codebase root. Blocks secrets, env files, dependencies, build artifacts, and path traversal.",
        inputSchema: {
          type: "object",
          required: ["paths"],
          properties: {
            paths: {
              type: "array",
              items: { type: "string" },
              description: "Relative source file paths to read.",
            },
          },
        },
        annotations: { readOnlyHint: true },
      }
    );
  }

  function resourceUrl(request: Request) {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}${normalized.path}`;
  }

  function baseUrl(request: Request) {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  }

  function authError(request: Request) {
    const url = new URL(request.url);
    const queryToken = url.searchParams.get("token") ?? "";
    if (queryToken) {
      if (normalized.webToken && timingSafeEqual(queryToken, normalized.webToken)) return null;
      return new Response("Not found", { status: 404 });
    }

    const auth = request.headers.get("authorization") ?? "";
    const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    if (bearer) {
      if (normalized.webToken && timingSafeEqual(bearer, normalized.webToken)) return null;
      const claims = verifyToken(bearer, normalized.oauthSigningKey, "access_token");
      if (claims?.scope === "mcp:use" && claims.client_id === normalized.oauthClientId) return null;
    }

    return Response.json(
      { message: "Unauthenticated." },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer realm="mcp", resource_metadata="${baseUrl(request)}/.well-known/oauth-protected-resource${normalized.path}"`,
        },
      }
    );
  }

  async function post(request: Request) {
    const auth = authError(request);
    if (auth) return auth;

    const rpc = (await request.json().catch(() => null)) as JsonRpcRequest | null;
    if (!rpc || rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") return jsonRpcError(null, -32600, "Invalid Request");
    if (rpc.method.startsWith("notifications/")) return new Response(null, { status: 202, headers: { "Content-Type": "application/json" } });

    try {
      switch (rpc.method) {
        case "initialize":
          return initialize(rpc);
        case "ping":
          return jsonRpcResult(rpc.id, {});
        case "tools/list":
          return jsonRpcResult(rpc.id, { tools });
        case "prompts/list":
          return jsonRpcResult(rpc.id, { prompts: [] });
        case "resources/list":
          return jsonRpcResult(rpc.id, { resources: [] });
        case "tools/call":
          return await callTool(rpc);
        default:
          return jsonRpcError(rpc.id, -32601, `The method [${rpc.method}] was not found.`);
      }
    } catch (error) {
      return jsonRpcResult(rpc.id, {
        content: [{ type: "text", text: error instanceof Error ? error.message : "Unknown MCP tool error." }],
        isError: true,
      });
    }
  }

  function get(request: Request) {
    const auth = authError(request);
    if (auth) return auth;
    return new Response(": mcp stream ready\n\n", {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  function del(request: Request) {
    const auth = authError(request);
    if (auth) return auth;
    return new Response(null, { status: 202 });
  }

  function protectedResource(request: Request) {
    const resource = resourceUrl(request);
    return Response.json({
      resource,
      authorization_servers: [resource],
      scopes_supported: ["mcp:use"],
      bearer_methods_supported: ["header"],
    });
  }

  function authorizationServer(request: Request) {
    const origin = baseUrl(request);
    return Response.json({
      issuer: resourceUrl(request),
      authorization_endpoint: `${origin}/oauth/mcp/authorize`,
      token_endpoint: `${origin}/oauth/mcp/token`,
      registration_endpoint: `${origin}/oauth/mcp/register`,
      response_types_supported: ["code"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["mcp:use"],
      grant_types_supported: ["authorization_code"],
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    });
  }

  async function register(request: Request) {
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return Response.json(
      {
        client_id: normalized.oauthClientId,
        client_name: payload.client_name ?? "Claude Web",
        grant_types: ["authorization_code"],
        response_types: ["code"],
        redirect_uris: Array.isArray(payload.redirect_uris) ? payload.redirect_uris : [],
        scope: "mcp:use",
        token_endpoint_auth_method: "client_secret_post",
      },
      { status: 201 }
    );
  }

  function authorize(request: Request) {
    const url = new URL(request.url);
    const clientId = url.searchParams.get("client_id") ?? "";
    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    const scope = url.searchParams.get("scope") || "mcp:use";

    if (!normalized.oauthClientId) return new Response("Not found", { status: 404 });
    if (url.searchParams.get("response_type") !== "code") return new Response("Unsupported response_type", { status: 400 });
    if (clientId !== normalized.oauthClientId) return new Response("Invalid client_id", { status: 400 });
    if (!redirectUri.startsWith("https://")) return new Response("Invalid redirect_uri", { status: 400 });
    if (scope !== "mcp:use") return new Response("Invalid scope", { status: 400 });

    const code = makeToken(
      {
        typ: "authorization_code",
        client_id: clientId,
        redirect_uri: redirectUri,
        scope,
        code_challenge: url.searchParams.get("code_challenge") ?? "",
        code_challenge_method: url.searchParams.get("code_challenge_method") ?? "",
      },
      normalized.oauthCodeTtl,
      normalized.oauthSigningKey
    );

    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    const state = url.searchParams.get("state");
    if (state) target.searchParams.set("state", state);
    return Response.redirect(target.toString(), 302);
  }

  async function token(request: Request) {
    const form = await request.formData();
    const basic = parseBasicAuth(request.headers.get("authorization") ?? "");
    const grantType = String(form.get("grant_type") ?? "");
    const clientId = String(form.get("client_id") ?? basic.clientId ?? "");
    const clientSecret = String(form.get("client_secret") ?? basic.clientSecret ?? "");
    const code = String(form.get("code") ?? "");
    const redirectUri = String(form.get("redirect_uri") ?? "");

    if (grantType !== "authorization_code") return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
    if (clientId !== normalized.oauthClientId || clientSecret !== normalized.oauthClientSecret) {
      return Response.json({ error: "invalid_client" }, { status: 401 });
    }

    const claims = verifyToken(code, normalized.oauthSigningKey, "authorization_code");
    if (!claims || claims.client_id !== clientId || claims.redirect_uri !== redirectUri) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }

    const codeChallenge = String(claims.code_challenge ?? "");
    if (codeChallenge && pkceChallenge(String(form.get("code_verifier") ?? "")) !== codeChallenge) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }

    return Response.json(
      {
        access_token: makeToken(
          { typ: "access_token", client_id: clientId, scope: "mcp:use", aud: resourceUrl(request) },
          normalized.oauthTokenTtl,
          normalized.oauthSigningKey
        ),
        token_type: "Bearer",
        expires_in: normalized.oauthTokenTtl,
        scope: "mcp:use",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  function initialize(rpc: JsonRpcRequest) {
    const requested = String((rpc.params?.protocolVersion as string | undefined) ?? normalized.supportedProtocolVersions[0]);
    if (!normalized.supportedProtocolVersions.includes(requested)) {
      return jsonRpcError(rpc.id, -32602, "Unsupported protocol version", { supported: normalized.supportedProtocolVersions, requested });
    }

    return jsonRpcResult(
      rpc.id,
      {
        protocolVersion: requested,
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: { name: normalized.serverName, version: normalized.serverVersion },
        instructions: "Use database-guide first, database-schema second, and database-select for bounded read-only SQL.",
      },
      { "Mcp-Session-Id": crypto.randomUUID() }
    );
  }

  async function callTool(rpc: JsonRpcRequest) {
    const params = rpc.params ?? {};
    const name = String(params.name ?? "");
    if (!toolNames.includes(name as (typeof toolNames)[number])) return jsonRpcError(rpc.id, -32602, `Unknown tool: ${name}`);

    let text: string;
    if (name === "database-guide") {
      const guide = normalized.guideText;
      text = typeof guide === "function" ? await guide() : guide;
    } else if (name === "database-schema") {
      text = await normalized.database.schema((params.arguments ?? {}) as never);
    } else if (name === "database-select") {
      text = await normalized.database.select((params.arguments ?? {}) as never);
    } else if (name === "codebase-map" && normalized.codebase) {
      text = await codebaseMap(normalized.codebase);
    } else if (name === "codebase-read" && normalized.codebase) {
      text = await codebaseRead(normalized.codebase, (params.arguments ?? {}) as never);
    } else {
      return jsonRpcError(rpc.id, -32602, `Unknown tool: ${name}`);
    }

    return jsonRpcResult(rpc.id, { content: [{ type: "text", text }] });
  }

  return { post, get, delete: del, protectedResource, authorizationServer, register, authorize, token };
}

function jsonRpcResult(id: JsonRpcRequest["id"], result: unknown, headers?: HeadersInit) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result }, { status: 200, headers: { "Content-Type": "application/json", ...(headers ?? {}) } });
}

function jsonRpcError(id: JsonRpcRequest["id"], code: number, message: string, data?: unknown) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } }, { status: 200 });
}

function parseBasicAuth(header: string) {
  if (!header.toLowerCase().startsWith("basic ")) return {};
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const [clientId, clientSecret] = decoded.split(":", 2);
  return { clientId, clientSecret };
}
