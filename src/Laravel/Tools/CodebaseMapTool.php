<?php

declare(strict_types=1);

namespace Bugmedia\McpGuideSchemaQuery\Tools;

use Bugmedia\McpGuideSchemaQuery\Support\CodebaseReader;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[IsReadOnly]
class CodebaseMapTool extends Tool
{
    protected string $name = 'codebase-map';

    protected string $description = 'List important source files in the configured codebase root. Use this before reading files.';

    public function handle(Request $request): Response
    {
        return Response::json(app(CodebaseReader::class)->map((array) config('mcp-guide-schema-query.codebase', [])));
    }
}
