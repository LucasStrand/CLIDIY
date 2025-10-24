import "isomorphic-fetch";
import { getAccessToken } from "../auth/msal.js";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
async function withAuthHeaders(init) {
    const token = await getAccessToken();
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Content-Type", "application/json");
    return { ...init, headers };
}
async function request(path, init) {
    const res = await fetch(`${GRAPH_BASE}${path}`, await withAuthHeaders(init));
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Graph ${res.status} ${res.statusText}: ${text}`);
    }
    if (res.status === 204)
        return null;
    return await res.json();
}
export async function me() {
    return request("/me");
}
export async function listTeams() {
    return request("/me/joinedTeams");
}
export async function listChannels(teamId) {
    return request(`/teams/${teamId}/channels`);
}
export async function resolveTeamId(teamIdOrName) {
    if (/^[0-9a-fA-F-]{36}$/.test(teamIdOrName))
        return teamIdOrName;
    const data = await listTeams();
    const needle = teamIdOrName.trim().toLowerCase();
    const match = (data.value ?? []).find((t) => (t.displayName ?? "").toLowerCase() === needle) ||
        (data.value ?? []).find((t) => (t.displayName ?? "").toLowerCase().includes(needle));
    if (!match)
        throw new Error(`Team not found: ${teamIdOrName}`);
    return match.id;
}
export async function resolveChannelId(teamId, channelIdOrName) {
    if (/^[0-9a-fA-F-]{36}$/.test(channelIdOrName))
        return channelIdOrName;
    const data = await listChannels(teamId);
    const needle = channelIdOrName.trim().toLowerCase();
    const match = (data.value ?? []).find((c) => (c.displayName ?? "").toLowerCase() === needle) ||
        (data.value ?? []).find((c) => (c.displayName ?? "").toLowerCase().includes(needle));
    if (!match)
        throw new Error(`Channel not found: ${channelIdOrName}`);
    return match.id;
}
export async function listChats() {
    return request("/me/chats");
}
export async function listUsers(search) {
    // Prefer basic list which needs fewer permissions; filter client-side
    const data = await request(`/users?$top=999`);
    if (!search)
        return data;
    const q = search.trim().toLowerCase();
    const filtered = (data.value ?? []).filter((u) => {
        const dn = (u.displayName ?? "").toLowerCase();
        const upn = (u.userPrincipalName ?? "").toLowerCase();
        const mail = (u.mail ?? "").toLowerCase();
        return dn.includes(q) || upn.includes(q) || mail.includes(q);
    });
    return { value: filtered };
}
export async function sendChannelMessage(teamId, channelId, text) {
    return request(`/teams/${teamId}/channels/${channelId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: { contentType: "html", content: text } }),
    });
}
export async function createOrGetOneOnOneChat(userId) {
    // Graph requires the caller to be included as a member for one-on-one chats
    const meUser = await me();
    const body = {
        chatType: "oneOnOne",
        members: [
            {
                "@odata.type": "#microsoft.graph.aadUserConversationMember",
                roles: ["owner"],
                "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${meUser.id}')`,
            },
            {
                "@odata.type": "#microsoft.graph.aadUserConversationMember",
                roles: ["owner"],
                "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${userId}')`,
            },
        ],
    };
    const chat = await request("/chats", {
        method: "POST",
        body: JSON.stringify(body),
    });
    return chat;
}
export async function sendChatMessage(chatId, text) {
    return request(`/chats/${chatId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: { contentType: "html", content: text } }),
    });
}
export async function getUserByIdOrUpn(idOrUpn) {
    const idPart = encodeURIComponent(idOrUpn);
    return request(`/users/${idPart}`);
}
//# sourceMappingURL=client.js.map