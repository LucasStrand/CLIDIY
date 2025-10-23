import 'isomorphic-fetch';
import { getAccessToken } from '../auth/msal.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

async function withAuthHeaders(init?: RequestInit): Promise<RequestInit> {
	const token = await getAccessToken();
	const headers = new Headers(init?.headers);
	headers.set('Authorization', `Bearer ${token}`);
	headers.set('Content-Type', 'application/json');
	return { ...init, headers };
}

async function request(path: string, init?: RequestInit) {
    const res = await fetch(`${GRAPH_BASE}${path}`, await withAuthHeaders(init));
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`Graph ${res.status} ${res.statusText}: ${text}`);
	}
	if (res.status === 204) return null;
	return await res.json();
}

export async function me() {
	return request('/me');
}

export async function listTeams() {
	return request('/me/joinedTeams');
}

export async function listChannels(teamId: string) {
	return request(`/teams/${teamId}/channels`);
}

export async function listChats() {
	return request('/me/chats');
}

export async function listUsers(search?: string) {
    if (!search) return request(`/users?$top=25`);
    const headers = new Headers();
    headers.set('ConsistencyLevel', 'eventual');
    return request(`/users?$search="${search}"&$top=25`, { headers });
}

export async function sendChannelMessage(teamId: string, channelId: string, text: string) {
	return request(`/teams/${teamId}/channels/${channelId}/messages`, {
		method: 'POST',
		body: JSON.stringify({ body: { contentType: 'html', content: text } }),
	});
}

export async function createOrGetOneOnOneChat(userId: string) {
    const body = {
        chatType: 'oneOnOne',
        members: [
            {
                '@odata.type': '#microsoft.graph.aadUserConversationMember',
                roles: ['owner'],
                'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${userId}')`,
            } as any,
        ],
    } as any;
    const chat = await request('/chats', {
        method: 'POST',
        body: JSON.stringify(body),
    });
    return chat;
}

export async function sendChatMessage(chatId: string, text: string) {
	return request(`/chats/${chatId}/messages`, {
		method: 'POST',
		body: JSON.stringify({ body: { contentType: 'html', content: text } }),
	});
}

export async function getUserByIdOrUpn(idOrUpn: string) {
    const idPart = encodeURIComponent(idOrUpn);
    return request(`/users/${idPart}`);
}


