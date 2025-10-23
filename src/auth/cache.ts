import fs from 'fs';
import { getMsalCachePath } from '../util/paths.js';
import type { TokenCacheContext, ICachePlugin } from '@azure/msal-node';

export function createFileCachePlugin(): ICachePlugin {
	const cachePath = getMsalCachePath();
	return {
		async beforeCacheAccess(cacheContext: TokenCacheContext): Promise<void> {
			if (fs.existsSync(cachePath)) {
				const data = fs.readFileSync(cachePath, 'utf-8');
				cacheContext.tokenCache.deserialize(data);
			}
		},
		async afterCacheAccess(cacheContext: TokenCacheContext): Promise<void> {
			if (cacheContext.cacheHasChanged) {
				fs.writeFileSync(cachePath, cacheContext.tokenCache.serialize());
			}
		},
	};
}


