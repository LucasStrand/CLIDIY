import { PublicClientApplication, LogLevel } from "@azure/msal-node";
import { createFileCachePlugin } from "./cache.js";
import { getSetting, readConfig, writeConfig } from "../util/config.js";
import open from "open";
const DEFAULT_SCOPES = [
    "User.Read",
    "User.ReadBasic.All",
    "offline_access",
    "Chat.ReadWrite",
    "Chat.Create",
    "Team.ReadBasic.All",
    "Channel.ReadBasic.All",
    "ChannelMessage.Send",
];
let pca;
function createMsalApp() {
    const clientId = getSetting("clientId");
    const tenantId = getSetting("tenantId") ?? "organizations";
    if (!clientId) {
        throw new Error('Missing clientId. Set TEAMSCLI_CLIENT_ID or save it via "teamscli config set".');
    }
    const authority = `https://login.microsoftonline.com/${tenantId}`;
    const config = {
        auth: { clientId, authority },
        system: { loggerOptions: { logLevel: LogLevel.Warning } },
        cache: { cachePlugin: createFileCachePlugin() },
    };
    return new PublicClientApplication(config);
}
export function getMsal() {
    if (!pca)
        pca = createMsalApp();
    return pca;
}
export async function login(scopes = DEFAULT_SCOPES) {
    const app = getMsal();
    const config = readConfig();
    const deviceCodeRequest = {
        scopes,
        deviceCodeCallback: (response) => {
            // Best-effort open, ignore errors
            open(response.verificationUri).catch(() => { });
            console.log(`To sign in, open ${response.verificationUri} and enter code: ${response.userCode}`);
        },
    };
    const result = await app.acquireTokenByDeviceCode(deviceCodeRequest);
    if (!result)
        throw new Error("Login failed.");
    // Save account reference
    const account = result.account ?? null;
    if (account) {
        writeConfig({
            ...config,
            account: {
                homeAccountId: account.homeAccountId,
                username: account.username,
            },
        });
    }
    return result;
}
export async function logout() {
    const app = getMsal();
    const cfg = readConfig();
    if (!cfg.account)
        return;
    const cache = app.getTokenCache();
    const account = await cache.getAccountByHomeId(cfg.account.homeAccountId);
    if (account) {
        await cache.removeAccount(account);
    }
    const newCfg = { ...cfg };
    delete newCfg.account;
    writeConfig(newCfg);
}
export async function getAccessToken(scopes = DEFAULT_SCOPES) {
    const app = getMsal();
    const cfg = readConfig();
    if (!cfg.account) {
        throw new Error("Not logged in. Run: teamscli login");
    }
    const account = await app
        .getTokenCache()
        .getAccountByHomeId(cfg.account.homeAccountId);
    if (!account) {
        throw new Error("Saved account not found. Run: teamscli login");
    }
    const silent = await app
        .acquireTokenSilent({ scopes, account })
        .catch(() => null);
    if (silent?.accessToken)
        return silent.accessToken;
    // Fallback to device code
    const dc = await login(scopes);
    return dc.accessToken;
}
//# sourceMappingURL=msal.js.map