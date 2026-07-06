export type McpServerConfig = {
  serverName: string;
  serverVersion?: string;
  path: string;
  webToken: string;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthSigningKey: string;
  oauthCodeTtl?: number;
  oauthTokenTtl?: number;
  defaultLimit?: number;
  maxLimit?: number;
  supportedProtocolVersions?: string[];
  guideText: string | (() => string | Promise<string>);
  database: DatabaseAdapter;
};

export type DatabaseAdapter = {
  guideName?: string;
  schema(args: SchemaArgs): Promise<string>;
  select(args: SelectArgs): Promise<string>;
};

export type SchemaArgs = {
  table?: string | null;
  include_columns?: boolean | null;
  include_indexes?: boolean | null;
  include_foreign_keys?: boolean | null;
};

export type SelectArgs = {
  query?: string;
  limit?: number | null;
};

export type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};
