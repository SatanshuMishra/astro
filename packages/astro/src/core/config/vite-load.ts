import type fsType from 'node:fs';
import { pathToFileURL } from 'node:url';
import { type ViteDevServer, createServer } from 'vite';
import loadFallbackPlugin from '../../vite-plugin-load-fallback/index.js';
import { debug } from '../logger/core.js';

async function createViteServer(root: string, fs: typeof fsType): Promise<ViteDevServer> {
	const viteServer = await createServer({
		server: { middlewareMode: true, hmr: false, watch: null },
		optimizeDeps: { noDiscovery: true },
		clearScreen: false,
		appType: 'custom',
		ssr: {
			// NOTE: Vite doesn't externalize linked packages by default. During testing locally,
			// these dependencies trip up Vite's dev SSR transform. Awaiting upstream feature:
			// https://github.com/vitejs/vite/pull/10939
			external: [
				'@astrojs/tailwind',
				'@astrojs/mdx',
				'@astrojs/react',
				'@astrojs/preact',
				'@astrojs/sitemap',
				'@astrojs/markdoc',
			],
		},
		plugins: [loadFallbackPlugin({ fs, root: pathToFileURL(root) })],
	});

	return viteServer;
}

interface LoadConfigWithViteOptions {
	root: string;
	configPath: string;
	fs: typeof fsType;
}

export async function loadConfigWithVite({
	configPath,
	fs,
	root,
}: LoadConfigWithViteOptions): Promise<Record<string, any>> {
	if (/\.[cm]?js$/.test(configPath)) {
		try {
			const config = await import(pathToFileURL(configPath).toString() + '?t=' + Date.now());
			return config.default ?? {};
		} catch (e) {
			// We do not need to throw the error here as we have a Vite fallback below
			debug('Failed to load config with Node', e);
		}
	}

	// Try Loading with Vite
	let server: ViteDevServer | undefined;
	try {
		server = await createViteServer(root, fs);
		const mod = await server.ssrLoadModule(configPath, { fixStacktrace: true });
		return mod.default ?? {};
	} finally {
		if (server) {
			await server.close();
		}
	}
}
