import fs from 'fs';
import { getMsalCachePath } from '../util/paths.js';
export function createFileCachePlugin() {
    const cachePath = getMsalCachePath();
    return {
        async beforeCacheAccess(cacheContext) {
            if (fs.existsSync(cachePath)) {
                const data = fs.readFileSync(cachePath, 'utf-8');
                cacheContext.tokenCache.deserialize(data);
            }
        },
        async afterCacheAccess(cacheContext) {
            if (cacheContext.cacheHasChanged) {
                fs.writeFileSync(cachePath, cacheContext.tokenCache.serialize());
            }
        },
    };
}
//# sourceMappingURL=cache.js.map