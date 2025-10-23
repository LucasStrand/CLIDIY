import fs from 'fs';
import path from 'path';
import { getConfigPath, getAppDir } from './paths.js';
export function readConfig() {
    const p = getConfigPath();
    if (!fs.existsSync(p))
        return {};
    try {
        const raw = fs.readFileSync(p, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
export function writeConfig(cfg) {
    const dir = getAppDir();
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2));
}
export function getSetting(name) {
    const envMap = {
        clientId: process.env.TEAMSCLI_CLIENT_ID,
        tenantId: process.env.TEAMSCLI_TENANT_ID,
    };
    return envMap[name] ?? readConfig()[name];
}
//# sourceMappingURL=config.js.map