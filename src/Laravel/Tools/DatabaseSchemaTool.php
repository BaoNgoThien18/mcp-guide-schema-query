<?php

declare(strict_types=1);

namespace Bugmedia\McpGuideSchemaQuery\Tools;

use Illuminate\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\DB;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[IsReadOnly]
class DatabaseSchemaTool extends Tool
{
    protected string $name = 'database-schema';

    protected string $description = 'Inspect the read-only database schema. Returns tables, columns, indexes, and foreign keys.';

    public function handle(Request $request): Response
    {
        $validated = $request->validate([
            'table' => ['nullable', 'string', 'max:128'],
            'include_columns' => ['nullable', 'boolean'],
            'include_indexes' => ['nullable', 'boolean'],
            'include_foreign_keys' => ['nullable', 'boolean'],
        ]);

        $connection = $this->connectionName();
        $driver = (string) config("database.connections.{$connection}.driver");

        return $driver === 'pgsql'
            ? Response::json($this->postgresSchema($connection, $validated))
            : Response::json($this->mysqlSchema($connection, $validated));
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'table' => $schema->string()->description('Optional table name. Omit to inspect every table.')->nullable(),
            'include_columns' => $schema->boolean()->description('Include columns. Defaults to true.')->nullable(),
            'include_indexes' => $schema->boolean()->description('Include indexes. Defaults to true.')->nullable(),
            'include_foreign_keys' => $schema->boolean()->description('Include foreign keys. Defaults to true.')->nullable(),
        ];
    }

    private function mysqlSchema(string $connection, array $validated): array
    {
        $database = (string) config("database.connections.{$connection}.database");
        $table = $validated['table'] ?? null;

        $tables = DB::connection($connection)
            ->table('information_schema.tables')
            ->selectRaw('TABLE_NAME as table_name, TABLE_ROWS as table_rows, TABLE_COMMENT as table_comment')
            ->where('table_schema', $database)
            ->where('table_type', 'BASE TABLE')
            ->when($table, fn ($query) => $query->where('table_name', $table))
            ->orderBy('table_name')
            ->get();

        $result = [
            'database' => $database,
            'driver' => 'mysql',
            'tables' => $tables->mapWithKeys(fn ($row) => [
                $row->table_name => [
                    'estimated_rows' => $row->table_rows,
                    'comment' => $row->table_comment,
                ],
            ])->all(),
        ];

        $tableNames = $tables->pluck('table_name')->all();
        if ($tableNames === []) {
            return $result;
        }

        if ($validated['include_columns'] ?? true) {
            $columns = DB::connection($connection)
                ->table('information_schema.columns')
                ->selectRaw('TABLE_NAME as table_name, COLUMN_NAME as column_name, COLUMN_TYPE as column_type, IS_NULLABLE as is_nullable, COLUMN_KEY as column_key, COLUMN_DEFAULT as column_default, EXTRA as extra, COLUMN_COMMENT as column_comment')
                ->where('table_schema', $database)
                ->whereIn('table_name', $tableNames)
                ->orderBy('table_name')
                ->orderBy('ordinal_position')
                ->get()
                ->groupBy('table_name');

            foreach ($columns as $tableName => $tableColumns) {
                $result['tables'][$tableName]['columns'] = $tableColumns->map(fn ($column) => [
                    'name' => $column->column_name,
                    'type' => $column->column_type,
                    'nullable' => $column->is_nullable === 'YES',
                    'key' => $column->column_key,
                    'default' => $column->column_default,
                    'extra' => $column->extra,
                    'comment' => $column->column_comment,
                ])->values()->all();
            }
        }

        if ($validated['include_indexes'] ?? true) {
            $indexes = DB::connection($connection)
                ->table('information_schema.statistics')
                ->selectRaw('TABLE_NAME as table_name, INDEX_NAME as index_name, COLUMN_NAME as column_name, NON_UNIQUE as non_unique, SEQ_IN_INDEX as seq_in_index')
                ->where('table_schema', $database)
                ->whereIn('table_name', $tableNames)
                ->orderBy('table_name')
                ->orderBy('index_name')
                ->orderBy('seq_in_index')
                ->get()
                ->groupBy(['table_name', 'index_name']);

            foreach ($indexes as $tableName => $tableIndexes) {
                $result['tables'][$tableName]['indexes'] = collect($tableIndexes)->map(fn ($columns, $indexName) => [
                    'name' => $indexName,
                    'unique' => (int) $columns->first()->non_unique === 0,
                    'columns' => $columns->pluck('column_name')->values()->all(),
                ])->values()->all();
            }
        }

        if ($validated['include_foreign_keys'] ?? true) {
            $foreignKeys = DB::connection($connection)
                ->table('information_schema.key_column_usage')
                ->selectRaw('TABLE_NAME as table_name, COLUMN_NAME as column_name, CONSTRAINT_NAME as constraint_name, REFERENCED_TABLE_NAME as referenced_table_name, REFERENCED_COLUMN_NAME as referenced_column_name')
                ->where('table_schema', $database)
                ->whereIn('table_name', $tableNames)
                ->whereNotNull('referenced_table_name')
                ->orderBy('table_name')
                ->orderBy('constraint_name')
                ->get()
                ->groupBy('table_name');

            foreach ($foreignKeys as $tableName => $keys) {
                $result['tables'][$tableName]['foreign_keys'] = $keys->map(fn ($key) => [
                    'name' => $key->constraint_name,
                    'column' => $key->column_name,
                    'references_table' => $key->referenced_table_name,
                    'references_column' => $key->referenced_column_name,
                ])->values()->all();
            }
        }

        return $result;
    }

    private function postgresSchema(string $connection, array $validated): array
    {
        $table = $validated['table'] ?? null;
        $tables = DB::connection($connection)
            ->table('information_schema.tables')
            ->select('table_name')
            ->where('table_schema', 'public')
            ->where('table_type', 'BASE TABLE')
            ->when($table, fn ($query) => $query->where('table_name', $table))
            ->orderBy('table_name')
            ->get();

        $result = [
            'database' => (string) config("database.connections.{$connection}.database"),
            'schema' => 'public',
            'driver' => 'pgsql',
            'tables' => $tables->mapWithKeys(fn ($row) => [$row->table_name => []])->all(),
        ];

        $tableNames = $tables->pluck('table_name')->all();
        if ($tableNames === []) {
            return $result;
        }

        if ($validated['include_columns'] ?? true) {
            $columns = DB::connection($connection)
                ->table('information_schema.columns')
                ->selectRaw('table_name, column_name, data_type, is_nullable, column_default')
                ->where('table_schema', 'public')
                ->whereIn('table_name', $tableNames)
                ->orderBy('table_name')
                ->orderBy('ordinal_position')
                ->get()
                ->groupBy('table_name');

            foreach ($columns as $tableName => $tableColumns) {
                $result['tables'][$tableName]['columns'] = $tableColumns->values()->all();
            }
        }

        if ($validated['include_indexes'] ?? true) {
            $indexes = DB::connection($connection)
                ->table('pg_indexes')
                ->selectRaw('tablename as table_name, indexname as index_name, indexdef')
                ->where('schemaname', 'public')
                ->whereIn('tablename', $tableNames)
                ->orderBy('tablename')
                ->orderBy('indexname')
                ->get()
                ->groupBy('table_name');

            foreach ($indexes as $tableName => $tableIndexes) {
                $result['tables'][$tableName]['indexes'] = $tableIndexes->values()->all();
            }
        }

        if ($validated['include_foreign_keys'] ?? true) {
            $foreignKeys = DB::connection($connection)->select(
                "select tc.table_name, tc.constraint_name, kcu.column_name, ccu.table_name as referenced_table_name, ccu.column_name as referenced_column_name
                from information_schema.table_constraints tc
                join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
                join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
                where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
                order by tc.table_name, tc.constraint_name"
            );

            foreach (collect($foreignKeys)->whereIn('table_name', $tableNames)->groupBy('table_name') as $tableName => $keys) {
                $result['tables'][$tableName]['foreign_keys'] = $keys->values()->all();
            }
        }

        return $result;
    }

    private function connectionName(): string
    {
        return (string) config('mcp-guide-schema-query.readonly_connection');
    }
}
