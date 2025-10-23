import os from 'os';
import path from 'path';
import fs from 'fs';
export function getAppDir() {
    const home = os.homedir();
    const dir = path.join(home, '.teamscli');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}
export function getConfigPath() {
    return path.join(getAppDir(), 'config.json');
}
export function getMsalCachePath() {
    return path.join(getAppDir(), 'msal-cache.json');
}
//# sourceMappingURL=paths.js.map