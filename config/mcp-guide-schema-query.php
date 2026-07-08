<?php

return [
    'server_name' => env('MCP_SERVER_NAME', 'Project Database'),
    'server_version' => env('MCP_SERVER_VERSION', '1.0.0'),
    'readonly_connection' => env('MCP_DB_CONNECTION', env('DB_CONNECTION')),
    'default_limit' => (int) env('MCP_QUERY_DEFAULT_LIMIT', 200),
    'max_limit' => (int) env('MCP_QUERY_MAX_LIMIT', 1000),
    'statement_timeout_ms' => (int) env('MCP_STATEMENT_TIMEOUT_MS', 15000),
    'guide_files' => [
        base_path('docs/mcp-system-overview.md'),
        base_path('docs/mcp-database-map.md'),
    ],
    'codebase' => [
        'root_dir' => base_path(),
        'max_files' => (int) env('MCP_CODEBASE_MAX_FILES', 400),
        'max_read_bytes' => (int) env('MCP_CODEBASE_MAX_READ_BYTES', 160000),
        'include_extensions' => [
            'php', 'js', 'jsx', 'ts', 'tsx', 'vue', 'json', 'md', 'yml', 'yaml',
            'xml', 'sql', 'blade.php', 'css', 'scss', 'env.example',
        ],
        'extra_ignore_dirs' => [],
    ],
];
