<?php

declare(strict_types=1);

namespace Bugmedia\McpGuideSchemaQuery\Servers;

use Bugmedia\McpGuideSchemaQuery\Tools\CodebaseMapTool;
use Bugmedia\McpGuideSchemaQuery\Tools\CodebaseReadTool;
use Bugmedia\McpGuideSchemaQuery\Tools\DatabaseGuideTool;
use Bugmedia\McpGuideSchemaQuery\Tools\DatabaseSchemaTool;
use Bugmedia\McpGuideSchemaQuery\Tools\DatabaseSelectTool;
use Laravel\Mcp\Server;

class GuideSchemaQueryServer extends Server
{
    protected string $name = 'Project Database';

    protected string $version = '1.0.0';

    protected array $supportedProtocolVersion = [
        '2025-11-25',
        '2025-06-18',
        '2025-03-26',
        '2024-11-05',
    ];

    protected string $instructions = <<<'MARKDOWN'
        You are connected to a production system through a read-only MCP server.
        Use database-guide first, database-schema second, and database-select only for bounded read-only SQL.
        The database-select tool is read-only and rejects write, DDL, file, lock, account, replication, and administrative SQL.
        Use codebase-map before codebase-read when you need source context.
    MARKDOWN;

    protected array $tools = [
        DatabaseGuideTool::class,
        DatabaseSchemaTool::class,
        DatabaseSelectTool::class,
        CodebaseMapTool::class,
        CodebaseReadTool::class,
    ];

    protected function boot(): void
    {
        $this->name = (string) config('mcp-guide-schema-query.server_name', $this->name);
        $this->version = (string) config('mcp-guide-schema-query.server_version', $this->version);
    }
}
