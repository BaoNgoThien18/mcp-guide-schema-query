<?php

declare(strict_types=1);

namespace Bugmedia\McpGuideSchemaQuery;

use Illuminate\Support\ServiceProvider;

class McpGuideSchemaQueryServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../../config/mcp-guide-schema-query.php', 'mcp-guide-schema-query');
    }

    public function boot(): void
    {
        $this->publishes([
            __DIR__.'/../../config/mcp-guide-schema-query.php' => config_path('mcp-guide-schema-query.php'),
        ], 'mcp-guide-schema-query-config');
    }
}
