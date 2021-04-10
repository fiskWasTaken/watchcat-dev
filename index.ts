import {Client, CommandInteraction, Guild, GuildMember, Message, MessageEmbed, TextChannel} from "discord.js";
import {Db, MongoClient} from "mongodb";
import {Storage} from "./model";
import {runMigrations} from "./migrations";
import {Handler, Stream} from "./handlers/handler";
import {Command} from "./commands";
import {Dispatcher} from "./dispatcher";
import * as fs from "fs";
import * as path from "path";

const express = require('express')
const config = require("./config.json");
const app = express()

const http = require("axios").default.create({
    headers: {"User-Agent": "Watchcat by fisk#8729"}
});

interface ResolveResult {
    handler: Handler,
    streamId: string
}

let dispatcher: Dispatcher

const commands: { [key: string]: Command } = {};

let store: Storage;
const discord = new Client({
    intents: ["GUILD_MESSAGES", "GUILDS"]
});

export interface Env {
    discord: Client,
    store: Storage,
    dispatcher: Dispatcher,
    handlers: HandlerManager,
    config: any,
    commands: { [key: string]: Command }
}

class HandlerManager {
    private map: { [key: string]: Handler } = {};

    loaded(): Handler[] {
        return Object.values(this.map);
    }

    get(id: string): Handler | null {
        return this.map[id];
    }

    async load(handler: Handler) {
        this.map[handler.id] = handler;
        handler.setTransport(http);
        handler.setBackend(db)
        handler.createWebhook(app);

        handler.on("updated", async (_: Stream[]) => {
            // nothing to do here
        });

        handler.on("started", async (stream: Stream) => {
            handler.log(`stream ${stream.id} started: ${stream.username}`);
            await dispatcher.announceToAll(handler, stream);
        });

        handler.on("stopped", async (stream: Stream) => {
            handler.log(`stream ${stream.id} stopped: ${stream.username}`);
            await store.messages().purgeForStreamer(discord, handler.id, stream.username);
        });

        await handler.ready()
        handler.log("Handler loaded")
    }

    resolveUrl(url: string): ResolveResult | null {
        for (let handler of Object.values(this.map)) {
            const streamId = handler.match(url)

            if (streamId) {
                return {handler, streamId}
            }
        }

        return null;
    }
}

const handlers = new HandlerManager();

discord.on("ready", () => {
    console.log(`Logged in as ${discord.user.tag}. Registering commands...`);

    fs.readdirSync('./commands').filter(f => f.endsWith('.ts')).map(f => require(`./commands/${f}`)).forEach(async f => {
        const command = f({discord, store, dispatcher, handlers, commands, config});
        command.privilege = command.privilege || "USER";
        commands[command.name] = command;

        if (command.options) {
            try {
                await discord.application.commands.create({
                    "name": command.name,
                    "description": command.description,
                    "options": command.options
                })
            } catch (e) {
                console.log(`Couldn't create command for ${command.name}`)
                console.log(e);
            }
        }
    });
});

discord.on("guildCreate", (guild: Guild) => {
    console.log(`Added to guild ${guild.name} (${guild.id}).`);
    guild.owner.user.createDM().then(async chan => {
        await chan.send("Hey there - I just wanted to help you set up stream notifications for your server." +
            "" +
            "To get started, you will need to define a channel in which updates will be sent. As a server administrator, @mention me from the channel you want me to target.")
    })
});

discord.on("guildDelete", async (guild: Guild) => {
    console.log(`Removed from guild ${guild.name} (${guild.id}) -- removing data.`);
    await store.guilds().delete(guild);
    await store.messages().purgeForGuild(discord, guild);
});

discord.on("interaction", async (interaction: CommandInteraction) => {
    const command = interaction.commandName;

    try {
        if (await userMayUseCommand(interaction.member, commands[command])) {
            await interaction.reply(await commands[command].callable(
                interaction.guild,
                interaction.options.map(opt => opt.value)
            ));
        } else {
            await interaction.reply(new MessageEmbed()
                .setColor("RED")
                .setTitle("Insufficient privileges")
                .setDescription("You do not have the rights to use this command."))
        }
    } catch (e) {
        // unknown interaction
        console.log(e)
    }
});

discord.on("message", async (msg: Message) => {
    if (!msg.mentions.has(discord.user) || msg.author.id == discord.user.id) {
        // message isn't intended for me
        return;
    }

    if (msg.mentions.everyone) {
        return;
    }

    if (!await hasSendMessagePrivilege(msg.channel as TextChannel)) {
        console.log("Missing SEND_MESSAGES permission, attempting to nag owner");

        msg.guild.owner.createDM().then(dm => {
            dm.send(`Hey! I need the privilege to send messages in <#${msg.channel.id}> so I can operate.`);
        });

        return;
    }

    console.log("received text message " + msg.content);

    const args = msg.content.split(/\s+/g);
    const command = args[1];

    if (commands.hasOwnProperty(command)) {
        if (await userMayUseCommand(msg.member, commands[command])) {
            await msg.channel.send(await commands[command].callable(msg.guild, args.slice(2)));
        } else {
            await msg.channel.send(new MessageEmbed()
                .setColor("RED")
                .setTitle("Insufficient privileges")
                .setDescription("You do not have the rights to use this command."))
        }
    } else {
        console.log(`not a command ${command}, showing help`);
        commands["help"].callable(msg.guild, []);
    }
});

export async function testGuildStatus(guild: Guild) {
    const guildInfo = await store.guilds().get(guild);

    if (!guildInfo) {
        // todo
        // await msg.channel.send(new MessageEmbed()
        //     .setColor("RED")
        //     .setTitle("Setup required")
        //     .setDescription(`Select a channel to receive notifications by using the **use** command.`));
        return false;
    }

    return true;
}

async function hasSendMessagePrivilege(channel: TextChannel) {
    const user = await channel.guild.members.fetch(discord.user)
    return user.permissionsIn(channel).has("SEND_MESSAGES");
}

function userIsOwner(member: GuildMember) {
    return member.permissions.has("ADMINISTRATOR");
}

async function userIsAdmin(member: GuildMember) {
    const guild = await store.guilds().get(member.guild);

    for (let role of (guild?.adminRoles || [])) {
        if (member.roles.cache.has(role)) {
            return true;
        }
    }

    return false;
}

async function userMayUseCommand(member: GuildMember, command: Command) {
    return userIsOwner(member) || command.privilege == "USER" || await userIsAdmin(member);
}

const port = config?.express?.port || 3000

app.get('/', (req, res) => {
    res.send('Watchcat is running')
})

app.listen(port, () => {
    console.log(`HTTP server listening on port ${port}`)
})

let db: Db;

function handlerId(handlerPath: string): string {
    return path.posix.basename(handlerPath).split(".")[0];
}

function enabled(handlerPath: string): boolean {
    return Object.keys(config.handlers).indexOf(handlerId(handlerPath)) !== -1;
}

MongoClient.connect(config.mongo.url).then(async mongo => {
    db = mongo.db(config.mongo.db);
    store = new Storage(db);

    console.log("Running DB migrations...");
    await runMigrations(store);

    const files = fs.readdirSync('./handlers').filter(f => f.endsWith('.ts')).filter(enabled);

    await Promise.all(files.map(async f => {
        const handler = new (require(`./handlers/${f}`).default)(config.handlers[handlerId(f)]);
        await handlers.load(handler);
    }));

    dispatcher = new Dispatcher(discord, store);

    discord.login(config.discord.token).then(async () => {
        console.log("Discord client is ready")
    }).catch(() => {
        console.log("Failed to sign in to Discord?")
    });
});