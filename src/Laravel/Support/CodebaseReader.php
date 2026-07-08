<?php

declare(strict_types=1);

namespace Bugmedia\McpGuideSchemaQuery\Support;

use RecursiveDirectoryIterator;
use RecursiveCallbackFilterIterator;
use RecursiveIteratorIterator;
use SplFileInfo;

class CodebaseReader
{
    private const IGNORE_DIRS = [
        '.git', '.next', 'dist', 'build', 'coverage', 'node_modules', 'vendor',
        'storage', 'bootstrap/cache', 'public/build', 'public/hot',
    ];

    private const BLOCKED_NAMES = [
        '.env', '.env.local', '.env.production', '.env.development', '.npmrc',
    ];

    public function map(array $config): array
    {
        $root = $this->root($config);
        $maxFiles = (int) ($config['max_files'] ?? 400);
        $files = [];

        $directory = new RecursiveDirectoryIterator($root, RecursiveDirectoryIterator::SKIP_DOTS);
        $filter = new RecursiveCallbackFilterIterator($directory, function (SplFileInfo $file) use ($config, $root): bool {
            if (! $file->isDir()) {
                return true;
            }

            return ! $this->isIgnoredPath($config, $root, $file->getPathname());
        });
        $iterator = new RecursiveIteratorIterator(
            $filter,
            RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($iterator as $file) {
            if (count($files) >= $maxFiles) {
                break;
            }

            if (! $file instanceof SplFileInfo || ! $file->isFile()) {
                continue;
            }

            $path = $file->getPathname();
            if (! $this->isAllowedFile($config, $path)) {
                continue;
            }

            $files[] = [
                'path' => $this->relative($root, $path),
                'bytes' => $file->getSize(),
            ];
        }

        return [
            'root' => $root,
            'file_count' => count($files),
            'files' => $files,
        ];
    }

    public function read(array $config, array $paths): array
    {
        $root = $this->root($config);
        $remaining = (int) ($config['max_read_bytes'] ?? 160000);
        $files = [];

        foreach ($paths as $path) {
            if (! is_string($path)) {
                continue;
            }

            $safePath = $this->safePath($root, $path);
            $relative = $this->relative($root, $safePath);

            if (! $this->isAllowedFile($config, $safePath) || ! is_file($safePath)) {
                $files[] = ['path' => $path, 'error' => 'File is not allowed or not found.'];
                continue;
            }

            if ($remaining <= 0) {
                $files[] = ['path' => $relative, 'error' => 'Read budget exhausted.'];
                continue;
            }

            $content = file_get_contents($safePath);
            if ($content === false) {
                $files[] = ['path' => $relative, 'error' => 'Could not read file.'];
                continue;
            }

            $slice = substr($content, 0, $remaining);
            $remaining -= strlen($slice);

            $files[] = [
                'path' => $relative,
                'bytes' => strlen($slice),
                'truncated' => strlen($slice) < strlen($content),
                'content' => $slice,
            ];
        }

        return ['files' => $files];
    }

    private function root(array $config): string
    {
        return realpath((string) ($config['root_dir'] ?? base_path())) ?: base_path();
    }

    private function safePath(string $root, string $path): string
    {
        $resolved = realpath($root.DIRECTORY_SEPARATOR.ltrim($path, DIRECTORY_SEPARATOR));
        if ($resolved === false || ($resolved !== $root && ! str_starts_with($resolved, $root.DIRECTORY_SEPARATOR))) {
            throw new \InvalidArgumentException('Path escapes codebase root.');
        }

        return $resolved;
    }

    private function isAllowedFile(array $config, string $path): bool
    {
        $root = $this->root($config);
        $basename = basename($path);

        if (in_array($basename, self::BLOCKED_NAMES, true) || str_starts_with($basename, '.env.')) {
            return false;
        }

        return ! $this->isIgnoredPath($config, $root, $path)
            && $this->hasAllowedExtension($config, $path);
    }

    private function isIgnoredPath(array $config, string $root, string $path): bool
    {
        $relative = $this->relative($root, $path);
        $normalized = str_replace(DIRECTORY_SEPARATOR, '/', $relative);

        foreach (array_merge(self::IGNORE_DIRS, $config['extra_ignore_dirs'] ?? []) as $dir) {
            $dir = trim(str_replace('\\', '/', (string) $dir), '/');
            if ($normalized === $dir || str_starts_with($normalized, $dir.'/')) {
                return true;
            }
        }

        return false;
    }

    private function hasAllowedExtension(array $config, string $path): bool
    {
        $normalized = str_replace(DIRECTORY_SEPARATOR, '/', $path);

        foreach ($config['include_extensions'] ?? [] as $extension) {
            $extension = ltrim((string) $extension, '.');
            if ($extension !== '' && str_ends_with($normalized, '.'.$extension)) {
                return true;
            }
        }

        return false;
    }

    private function relative(string $root, string $path): string
    {
        return ltrim(str_replace($root, '', $path), DIRECTORY_SEPARATOR);
    }
}
