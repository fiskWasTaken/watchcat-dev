import {PiczelPlugin} from "./plugins/piczel";
import {Client, Guild, GuildMember, Message, MessageEmbed, TextChannel} from "discord.js";
import {Db, MongoClient} from "mongodb";
import {Storage} from "./model";
import {runMigrations} from "./migrations";
import {Plugin, Stream} from "./plugins/plugin";
import {PicartoPlugin} from "./plugins/picarto";
import {PomfPlugin} from "./plugins/pomf";
import {TwitchPlugin} from "./plugins/twitch";
import {Command} from "./commands";
import {buildEmbed, Dispatcher} from "./dispatcher";

const express = require('express')
const config = require("./config.json");
const app = express()

const http = require("axios").default.create({
    headers: {"User-Agent": "Watchcat by fisk#8729"}
});

let store: Storage;
const discord = new Client();

discord.on("ready", () => {
    console.log(`Logged in as ${discord.user.tag}.`);
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

discord.on("message", async (msg: Message) => {
    if (!msg.mentions.has(discord.user) || msg.author.id == discord.user.id) {
        // message isn't intended for me
        return;
    }

    if (!hasSendMessagePrivilege(msg.channel as TextChannel)) {
        console.log("Missing SEND_MESSAGES permission, attempting to nag owner");

        msg.guild.owner.createDM().then(dm => {
            dm.send(`Hey! I need the privilege to send messages in <#${msg.channel.id}> so I can operate.`);
        });

        return;
    }

    console.log("received message " + msg.content);

    const command = msg.content.split(" ")[1];
    if (commands.hasOwnProperty(command)) {
        if (await userMayUseCommand(msg.member, commands[command])) {
            commands[command].callable(msg);
        } else {
            await msg.channel.send(new MessageEmbed()
                .setColor("RED")
                .setTitle("Insufficient privileges")
                .setDescription("You do not have the rights to use this command."))
        }
    } else {
        console.log(`not a command ${command}, showing help`);
        commands["help"].callable(msg);
    }
});

discord.login(config.discord.token).then(async () => {
    console.log("Discord client is ready")
}).catch(() => {
    console.log("Failed to sign in to Discord?")
});

interface ResolveResult {
    plugin: Plugin,
    streamId: string
}

class PluginManager {
    private map: { [key: string]: Plugin } = {};

    loaded(): Plugin[] {
        return Object.values(this.map);
    }

    get(id: string): Plugin | null {
        return this.map[id];
    }

    async load(plugin: Plugin) {
        if (config?.plugins.hasOwnProperty(plugin.id)) {
            plugin.setConfig(config.plugins[plugin.id])
        }

        plugin.setTransport(http);
        plugin.setBackend(db)
        plugin.createWebhook(app);

        plugin.on("updated", async (_: Stream[]) => {
            // nothing to do here
        });

        plugin.on("started", async (stream: Stream) => {
            plugin.log(`stream ${stream.id} started: ${stream.username}`);
            await dispatcher.announceToAll(plugin, stream);
        });

        plugin.on("stopped", async (stream: Stream) => {
            plugin.log(`stream ${stream.id} stopped: ${stream.username}`);
            await store.messages().purgeForStreamer(discord, plugin.id, stream.username);
        });

        await plugin.ready()
        plugin.log("Plugin loaded")

        this.map[plugin.id] = plugin;
    }

    resolveUrl(url: string): ResolveResult | null {
        for (let plugin of Object.values(this.map)) {
            const streamId = plugin.match(url)

            if (streamId) {
                return {plugin, streamId}
            }
        }

        return null;
    }
}

let dispatcher: Dispatcher

const commands: { [key: string]: Command } = {};

function registerCommand(command: Command) {
    command.privilege = command.privilege || "USER";
    commands[command.name] = command;
}

registerCommand({
    description: "Designates the current channel for stream updates.",
    callable: async (msg: Message) => {
        const guildInfo = await store.guilds().get(msg.guild);

        if (guildInfo && guildInfo.channelId) {
            await store.messages().purgeForChannel(discord, (await discord.channels.fetch(guildInfo.channelId) as TextChannel));
        }

        store.guilds().setChannel(msg.guild, msg.channel.id).then(() => {
            msg.channel.send(new MessageEmbed()
                .setDescription(`<#${msg.channel.id}> is now set to receive notifications.`)
                .setColor("GREEN"));
        });
    },
    name: "use",
    privilege: "ADMIN"
});

registerCommand({
    description: "Add one or more user(s) to the watchlist.",
    callable: async (msg: Message) => {
        const args = msg.content.split(" ");
        const results = Array.from(new Set(args.slice(2))).map(result => plugins.resolveUrl(result)).filter(result => result)

        if (results.length == 0) {
            await msg.channel.send(new MessageEmbed().setColor("BLUE").setDescription("**Usage**: watch piczel.tv/watch/user1 picarto.tv/user2 ..."));
            return;
        }

        results.forEach(result => {
            dispatcher.announceDeferred(msg.guild, result.plugin, result.streamId)
        });

        Promise.all(results.map((result) => store.guilds().watch(msg.guild, result.plugin.id, result.streamId))).then(results => {
            const modified = results.filter(result => result.modifiedCount > 0).length;
            const unmodified = results.length - modified;
            let result = `${modified} user(s) added to watchlist.`;

            if (unmodified) {
                result += ` ${unmodified} user(s) were already present.`;
            }

            msg.channel.send(new MessageEmbed().setColor("GREEN").setDescription(result));
        });
    },
    name: "watch",
    privilege: "ADMIN",
});

registerCommand({
    description: "Remove one or more user(s) from the watchlist.",
    callable: async (msg: Message) => {
        const args = msg.content.split(" ");
        const results = Array.from(new Set(args.slice(2))).map(result => plugins.resolveUrl(result));

        if (results.length == 0) {
            await msg.channel.send(new MessageEmbed().setColor("BLUE").setDescription("**Usage**: unwatch piczel.tv/watch/user1 picarto.tv/user2 ..."));
            return;
        }

        results.forEach(result => {
            dispatcher.unannounce(msg.guild, result.plugin.id, result.streamId);
        });

        Promise.all(results.map((result) => store.guilds().unwatch(msg.guild, result.plugin.id, result.streamId))).then(results => {
            const modified = results.filter(result => result.modifiedCount > 0).length;
            const unmodified = results.length - modified;
            let result = `${modified} user(s) removed from watchlist.`;

            if (unmodified) {
                result += ` ${unmodified} user(s) were not present.`;
            }

            msg.channel.send(new MessageEmbed().setColor("GREEN").setDescription(result))
        });
    },
    name: "unwatch",
    privilege: "ADMIN",
});

registerCommand({
    description: "(Debug) Get a list of loaded plugins.",
    callable: async (msg: Message) => {
        await msg.channel.send(new MessageEmbed()
            .setColor("BLUE")
            .setTitle("Loaded Plugins")
            .setDescription(plugins.loaded().map(plugin => `${plugin.name} (${plugin.id})`)))
    },
    hidden: true,
    name: "plugins"
})

registerCommand({
    description: "(Debug) Test regular expression matching for a given stream URL.",
    callable: async (msg: Message) => {
        const args = msg.content.split(" ");
        const result = plugins.resolveUrl(args[2]);

        if (result.plugin) {
            await msg.channel.send(`Found matching plugin ${result.plugin.name} - ${result.streamId}`)
        } else {
            await msg.channel.send(`Can't find matching plugin for ${args[2]}`);
        }
    },
    hidden: true,
    name: "match"
})

registerCommand({
    description: "(Debug) Render a stream title card.",
    callable: async (msg: Message) => {
        const args = msg.content.split(" ");
        const result = plugins.resolveUrl(args[2])

        if (!result) {
            await msg.channel.send("Can't find a matching plugin")
            return
        }

        const stream = result.plugin.cachedStream(result.streamId);

        if (!stream) {
            await msg.channel.send("Can't find this user online")
        } else {
            await msg.channel.send(buildEmbed(result.plugin, stream));
        }
    },
    hidden: true,
    name: "card"
});

registerCommand({
    description: "(Debug) Manual purge of notifications for this server, if there's any lingering ones.",
    callable: async (msg: Message) => {
        await store.messages().purgeForGuild(discord, msg.guild);
    },
    hidden: true,
    name: "purge",
    privilege: "OWNER"
});

registerCommand({
    description: "Set a role to ping with a self-destructing message when posting a stream. `ping off` to turn this off.",
    callable: async (msg: Message) => {
        const args = msg.content.split(" ");

        if (args[2] == "off") {
            await store.guilds().unsetPingRole(msg.guild);
            await msg.channel.send(new MessageEmbed().setDescription(`Pinging disabled.`).setColor("GREEN"));
            return;
        }

        const role = msg.guild.roles.resolve(args[2]);

        if (!role) {
            await msg.channel.send(new MessageEmbed().setDescription(`Could not find a role matching ID (${role}). Try copying the ID by right-clicking on the role.`).setColor("RED"));
            return;
        }

        await store.guilds().setPingRole(msg.guild, role.id);
        await msg.channel.send(new MessageEmbed().setDescription(`Set ping role to **${role.name}**.`).setColor("GREEN"));
    },
    name: "ping",
    privilege: "OWNER"
})

registerCommand({
    description: "Grant admin privileges to a given role.",
    callable: async (msg: Message) => {
        const args = msg.content.split(" ");
        const role = msg.guild.roles.resolve(args[2]);

        if (!role) {
            await msg.channel.send(new MessageEmbed().setDescription(`Could not find a role matching ID (${role}). Try copying the ID by right-clicking on the role.`).setColor("RED"));
            return;
        }

        await store.guilds().grant(msg.guild, role.id);
        await msg.channel.send(new MessageEmbed().setDescription(`Granted admin privileges for role **${role.name}**.`).setColor("GREEN"));
    },
    name: "grant",
    privilege: "OWNER",
});

registerCommand({
    description: "Revoke admin privileges from a given role.",
    callable: async (msg: Message) => {
        const args = msg.content.split(" ");
        const role = args[2];

        const result = await store.guilds().revoke(msg.guild, role);

        // nb: don't try to naively resolve role here; we might want to remove a deleted role.
        if (result.modifiedCount > 0) {
            await msg.channel.send(new MessageEmbed().setDescription(`Revoked admin privileges for this role.`).setColor("GREEN"));
        } else {
            await msg.channel.send(new MessageEmbed().setDescription(`Cannot seem to find a role with this ID (${role}). Was it already removed?`).setColor("RED"));
        }
    },
    name: "revoke",
    privilege: "OWNER",
});

registerCommand({
    description: "Display all roles with admin privileges.",
    callable: async (msg: Message) => {
        if (!await testGuildStatus(msg)) return;

        const guildInfo = await store.guilds().get(msg.guild);
        const roles = (guildInfo.adminRoles || []).map(id => {
            return {
                id: id,
                object: msg.guild.roles.resolve(id)
            }
        });

        await msg.channel.send(new MessageEmbed()
            .setColor("BLUE")
            .setTitle("Admins")
            .setDescription("The following roles are able to use Watchcat admin features on this server.")
            .addField("Roles", roles.map(role => role.object ? `**${role.object.name}** (${role.object.id})` : `(deleted role ${role.id})`).join("\n")));
    },
    name: "admins",
    privilege: "OWNER",
});

async function testGuildStatus (msg: Message) {
    const guildInfo = await store.guilds().get(msg.guild);

    if (!guildInfo) {
        await msg.channel.send(new MessageEmbed()
            .setColor("RED")
            .setTitle("Setup required")
            .setDescription(`Select a channel to receive notifications by using the **use** command.`));
        return false;
    }

    return true;
}

registerCommand({
    name: "status",
    description: "View the watchlist, and who is online.",
    callable: async (msg: Message) => {
        if (!await testGuildStatus(msg)) return;

        const guildInfo = await store.guilds().get(msg.guild);

        let pingText = "";

        if (guildInfo.pingRole) {
            pingText = ` Role <@&${guildInfo.pingRole}> will be pinged.`;
        }

        if (!guildInfo?.networks) {
            await msg.channel.send(new MessageEmbed()
                .setColor("BLUE")
                .setTitle("No streams followed")
                .setDescription(`You have not yet configured the bot to post any streams. Stream updates will be posted to <#${guildInfo.channelId}>.${pingText}`));
            return false;
        }

        for (let [networkId, data] of Object.entries(guildInfo?.networks || {})) {
            const userList = (data.streams || []);
            const plugin = plugins.get(networkId);

            if (!plugin) {
                console.log("warn: no plugin with ID " + networkId)
                continue;
            }

            const online = userList.filter(user => plugin.cachedStream(user));
            const offline = userList.filter(user => !plugin.cachedStream(user));

            const e = new MessageEmbed()
                .setColor("BLUE")
                .setTitle(`Watchcat Status - ${plugin.name}`)
                .setDescription(`Posting stream updates to <#${guildInfo.channelId}>.${pingText}`);

            if (online.length > 0) {
                e.addField(`Online (${online.length})`, online.map(username => `**${username}** ${plugin.resolveStreamUrl(username)}`).join("\n"));
            }

            if (offline.length > 0) {
                e.addField(`Offline (${offline.length})`, offline.map(username => `**${username}** ${plugin.resolveStreamUrl(username)}`).join("\n"));
            }

            await msg.channel.send(e);
        }

    }
});

registerCommand({
    description: "View this help page.",
    callable: async (msg: Message) => {
        const embed = new MessageEmbed()
            .setTitle("Watchcat")
            .setDescription("Discord stream push notification service. OWNER commands require a user to have the Administrator permission.")
            .setColor("BLUE");

        // owner functions are not in this release
        ["OWNER", "ADMIN", "USER"].forEach(priv => {
            const opts = Object.values(commands)
                .filter(command => !command.hidden)
                .filter(command => command.privilege == priv)
                .map((command: Command) => {
                    return `**${command.name}** ${command.description}`;
                });
            embed.addField(priv, opts);
        });

        await msg.channel.send(embed);
    },
    name: "help"
});

registerCommand({
    description: "Information about this bot, and the invite link.",
    callable: async msg => {
        const projectUrl = "https://github.com/fisuku/watchcat";

        await msg.channel.send(new MessageEmbed()
            .setColor("BLUE")
            .setTitle("Watchcat - stream notification service")
            .setDescription(`This bot supplies a push notification service for Discord. You can add this bot to your server using the invite URL.`)
            .addField("Invite URL", config.inviteUrl)
            .setURL(projectUrl));
    },
    name: "about",
});

function hasSendMessagePrivilege(channel: TextChannel) {
    return channel.guild.member(discord.user).permissionsIn(channel).has("SEND_MESSAGES");
}

function userIsOwner(member: GuildMember) {
    return member.hasPermission("ADMINISTRATOR");
}

async function userIsAdmin(member: GuildMember) {
    const guild = await store.guilds().get(member.guild);

    if (guild) {
        for (let role of (guild.adminRoles || [])) {
            if (member.roles.cache.has(role)) {
                return true;
            }
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

const plugins = new PluginManager();
let db: Db;

MongoClient.connect(config.mongo.url).then(async mongo => {
    db = mongo.db(config.mongo.db);
    store = new Storage(db);

    console.log("Running DB migrations...");
    await runMigrations(store);

    [
        new PiczelPlugin(),
        new PicartoPlugin(),
        new PomfPlugin(),
        new TwitchPlugin()
    ].forEach(plugin => plugins.load(plugin));

    dispatcher = new Dispatcher(discord, store);
});