<?php

declare(strict_types=1);

namespace Bugmedia\McpGuideSchemaQuery\Support;

class SqlGuard
{
    private const ALLOWED_PREFIXES = ['select', 'with', 'show', 'explain', 'describe', 'desc'];

    private const BLOCKED_PATTERN = '/\b(insert|update|delete|replace|upsert|merge|drop|alter|create|truncate|rename|grant|revoke|lock|unlock|load|outfile|dumpfile|copy|vacuum|refresh|reindex|cluster|set\s+role|set|reset|call|do|handler|optimize|analyze|repair|purge|flush|kill|shutdown|start|stop|change|prepare|execute|deallocate)\b/i';

    public static function normalize(string $query, int $limit): string
    {
        $query = trim(preg_replace('/;\s*$/', '', trim($query)) ?? trim($query));

        if ($query === '') {
            throw new \InvalidArgumentException('The query field is required.');
        }

        if (str_contains($query, ';')) {
            throw new \InvalidArgumentException('Only one SQL statement is allowed.');
        }

        $withoutComments = self::withoutComments($query);
        $prefix = strtolower(strtok(ltrim($withoutComments), " \t\r\n(") ?: '');

        if (! in_array($prefix, self::ALLOWED_PREFIXES, true)) {
            throw new \InvalidArgumentException('Only SELECT, WITH ... SELECT, SHOW, EXPLAIN, DESCRIBE, and DESC queries are allowed.');
        }

        if ($prefix === 'with' && ! preg_match('/\bselect\b/i', $withoutComments)) {
            throw new \InvalidArgumentException('WITH queries must contain a SELECT statement.');
        }

        if (preg_match(self::BLOCKED_PATTERN, $withoutComments)) {
            throw new \InvalidArgumentException('Query contains a blocked write, DDL, file, lock, or administrative keyword.');
        }

        if (preg_match('/\bfor\s+update\b|\block\s+in\s+share\s+mode\b/i', $withoutComments)) {
            throw new \InvalidArgumentException('Locking reads are not allowed.');
        }

        if (in_array($prefix, ['select', 'with'], true) && ! preg_match('/\blimit\s+\d+\b/i', $withoutComments)) {
            return $query.' LIMIT '.$limit;
        }

        return $query;
    }

    private static function withoutComments(string $query): string
    {
        return preg_replace('/(--[^\n]*|#[^\n]*|\/\*.*?\*\/)/s', ' ', $query) ?? $query;
    }
}
