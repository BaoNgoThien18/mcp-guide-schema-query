<?php

declare(strict_types=1);

namespace Bugmedia\McpGuideSchemaQuery\Tools;

use Bugmedia\McpGuideSchemaQuery\Support\CodebaseReader;
use Illuminate\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;
use Throwable;

#[IsReadOnly]
class CodebaseReadTool extends Tool
{
    protected string $name = 'codebase-read';

    protected string $description = 'Read selected source files. Blocks secrets, env files, dependencies, build artifacts, and path traversal.';

    public function handle(Request $request): Response
    {
        $validated = $request->validate([
            'paths' => ['required', 'array', 'max:25'],
            'paths.*' => ['string', 'max:500'],
        ]);

        try {
            return Response::json(app(CodebaseReader::class)->read(
                (array) config('mcp-guide-schema-query.codebase', []),
                $validated['paths'],
            ));
        } catch (Throwable $exception) {
            return Response::error($exception->getMessage());
        }
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'paths' => $schema->array()
                ->items($schema->string())
                ->description('Relative source file paths to read.')
                ->required(),
        ];
    }
}
