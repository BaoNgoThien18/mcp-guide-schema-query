<?php

declare(strict_types=1);

namespace Bugmedia\McpGuideSchemaQuery\Tools;

use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[IsReadOnly]
class DatabaseGuideTool extends Tool
{
    protected string $name = 'database-guide';

    protected string $description = <<<'MARKDOWN'
        Read the MCP system overview, important database relationships, query rules, sensitive-column rules, and recommended query patterns.
        Use this before database-schema and database-select.
    MARKDOWN;

    public function handle(Request $request): Response
    {
        $parts = [];

        foreach ((array) config('mcp-guide-schema-query.guide_files', []) as $file) {
            if (is_string($file) && is_file($file)) {
                $parts[] = trim((string) file_get_contents($file));
            }
        }

        return Response::text(trim(implode("\n\n---\n\n", array_filter($parts))));
    }
}
