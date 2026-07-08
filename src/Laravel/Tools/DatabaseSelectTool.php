<?php

declare(strict_types=1);

namespace Bugmedia\McpGuideSchemaQuery\Tools;

use Bugmedia\McpGuideSchemaQuery\Support\SqlGuard;
use Illuminate\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\DB;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;
use Throwable;

#[IsReadOnly]
class DatabaseSelectTool extends Tool
{
    protected string $name = 'database-select';

    protected string $description = 'Run a free-form read-only SQL query. Allowed statements: SELECT, WITH ... SELECT, SHOW, EXPLAIN, DESCRIBE, DESC.';

    public function handle(Request $request): Response
    {
        $validated = $request->validate([
            'query' => ['required', 'string', 'max:20000'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:'.config('mcp-guide-schema-query.max_limit', 1000)],
        ]);

        $limit = min(
            (int) ($validated['limit'] ?? config('mcp-guide-schema-query.default_limit', 200)),
            (int) config('mcp-guide-schema-query.max_limit', 1000),
        );

        try {
            $query = SqlGuard::normalize((string) $validated['query'], $limit);
            $startedAt = microtime(true);
            $rows = $this->runReadOnly($query);
        } catch (Throwable $exception) {
            return Response::error($exception->getMessage());
        }

        return Response::json([
            'query' => $query,
            'row_count' => count($rows),
            'elapsed_ms' => round((microtime(true) - $startedAt) * 1000, 2),
            'rows' => $rows,
        ]);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'query' => $schema->string()->description('Read-only SQL query. Use SELECT/SHOW/EXPLAIN/DESCRIBE only.')->required(),
            'limit' => $schema->integer()->description('Maximum rows. Defaults to configured default, capped by configured max.')->nullable(),
        ];
    }

    private function runReadOnly(string $query): array
    {
        $connection = (string) config('mcp-guide-schema-query.readonly_connection');
        $driver = (string) config("database.connections.{$connection}.driver");
        $timeoutMs = (int) config('mcp-guide-schema-query.statement_timeout_ms', 15000);
        $db = DB::connection($connection);

        try {
            if ($driver === 'pgsql') {
                $db->statement('begin read only');
                $db->statement("set local statement_timeout = '{$timeoutMs}ms'");
            } elseif (in_array($driver, ['mysql', 'mariadb'], true)) {
                $seconds = max(1, (int) ceil($timeoutMs / 1000));
                $this->tryStatement("set session max_execution_time = {$timeoutMs}");
                $this->tryStatement("set session max_statement_time = ".($timeoutMs / 1000));
                $this->tryStatement("set session innodb_lock_wait_timeout = {$seconds}");
                $db->statement('start transaction read only');
            } else {
                $db->beginTransaction();
            }

            $rows = $db->select($query);
            $db->statement('rollback');

            return $rows;
        } catch (Throwable $exception) {
            try {
                $db->statement('rollback');
            } catch (Throwable) {
                //
            }

            throw $exception;
        }
    }

    private function tryStatement(string $statement): void
    {
        try {
            DB::connection((string) config('mcp-guide-schema-query.readonly_connection'))->statement($statement);
        } catch (Throwable) {
            //
        }
    }
}
