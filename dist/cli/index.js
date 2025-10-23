#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';
import { login, logout } from '../auth/msal.js';
import { readConfig, writeConfig, getSetting } from '../util/config.js';
import { me, listTeams, listChannels, listChats, sendChannelMessage, sendChatMessage, createOrGetOneOnOneChat, listUsers, getUserByIdOrUpn } from '../graph/client.js';
dotenv.config();
const program = new Command();
program.name('teamscli').description('CLI for Microsoft Teams messaging via Microsoft Graph').version('0.1.0');
program
    .command('config')
    .description('Get or set configuration')
    .option('--set <key=value...>', 'Set key=value pairs (clientId, tenantId)')
    .action((opts) => {
    const cfg = readConfig();
    if (opts.set) {
        for (const kv of opts.set) {
            const [k, v] = kv.split('=');
            if (!k || !v)
                throw new Error(`Invalid pair: ${kv}`);
            if (k !== 'clientId' && k !== 'tenantId')
                throw new Error(`Unknown key: ${k}`);
            cfg[k] = v;
        }
        writeConfig(cfg);
        console.log(chalk.green('Saved config.'));
    }
    else {
        console.log({
            clientId: getSetting('clientId') ?? null,
            tenantId: getSetting('tenantId') ?? null,
            persisted: cfg,
        });
    }
});
program
    .command('login')
    .description('Sign-in using device code flow')
    .action(async () => {
    const spinner = ora('Signing in...').start();
    try {
        await login();
        spinner.succeed('Signed in.');
    }
    catch (e) {
        spinner.fail(e.message ?? String(e));
        process.exitCode = 1;
    }
});
program
    .command('logout')
    .description('Sign-out and clear cached tokens')
    .action(async () => {
    await logout();
    console.log(chalk.green('Signed out.'));
});
program
    .command('me')
    .description('Show current user')
    .action(async () => {
    const m = await me();
    console.log(m);
});
program
    .command('teams')
    .description('List joined teams')
    .action(async () => {
    const data = await listTeams();
    for (const t of data.value ?? []) {
        console.log(`${chalk.cyan(t.displayName)} ${chalk.gray(`(${t.id})`)}`);
    }
});
program
    .command('channels')
    .description('List channels for a team')
    .requiredOption('-t, --team <teamId>', 'Team ID')
    .action(async (opts) => {
    const data = await listChannels(opts.team);
    for (const c of data.value ?? []) {
        console.log(`${chalk.cyan(c.displayName)} ${chalk.gray(`(${c.id})`)}`);
    }
});
program
    .command('chats')
    .description('List chats')
    .action(async () => {
    const data = await listChats();
    for (const c of data.value ?? []) {
        console.log(`${chalk.cyan(c.topic ?? c.id)} ${chalk.gray(`(${c.id})`)}`);
    }
});
program
    .command('users')
    .description('List users or search by display name/email')
    .option('-q, --query <text>', 'Search text')
    .action(async (opts) => {
    const data = await listUsers(opts.query);
    for (const u of data.value ?? []) {
        console.log(`${chalk.cyan(u.displayName)} ${chalk.gray(`${u.userPrincipalName} (${u.id})`)}`);
    }
});
program
    .command('send:channel')
    .description('Send a message to a channel')
    .requiredOption('-t, --team <teamId>', 'Team ID')
    .requiredOption('-c, --channel <channelId>', 'Channel ID')
    .requiredOption('-m, --message <text>', 'Message text (HTML allowed)')
    .action(async (opts) => {
    const res = await sendChannelMessage(opts.team, opts.channel, opts.message);
    console.log(chalk.green('Message sent.'), res?.id ?? '');
});
program
    .command('send:chat')
    .description('Send a message to a 1:1 chat')
    .option('--chat-id <chatId>', 'Existing chat ID')
    .option('--user <userIdOrUpn>', 'User ID or UPN to create one-on-one chat with')
    .requiredOption('-m, --message <text>', 'Message text (HTML allowed)')
    .action(async (opts) => {
    let chatId = opts.chatId;
    if (!chatId) {
        if (!opts.user)
            throw new Error('Provide --chat-id or --user');
        const user = await getUserByIdOrUpn(opts.user);
        const chat = await createOrGetOneOnOneChat(user.id);
        chatId = chat.id;
    }
    const res = await sendChatMessage(chatId, opts.message);
    console.log(chalk.green('Message sent.'), res?.id ?? '');
});
program.parseAsync(process.argv);
//# sourceMappingURL=index.js.map