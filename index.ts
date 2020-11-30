import {PiczelPlugin} from "./plugins/piczel";
import {Client, Guild, GuildMember, Message, MessageEmbed, TextChannel} from "discord.js";
import {MongoClient} from "mongodb";
import {GuildData, Storage} from "./model";
import {runMigrations} from "./migrations";
import {Stream, WatchcatPlugin} from "./plugins/plugin";
import {DummyClient} from "./plugins/dummy";
import {PicartoClient, PicartoStream} from "./plugins/picarto";
import {PomfPlugin} from "./plugins/pomf";

const config = require("./config.json");
const discord = new Client();

const http = require("axios").default.create({
    headers: {"User-Agent": "Watchcat by fisk#8729"}
});

discord.on("ready", () => {
    console.log(`Logged in as ${discord.user.tag}.`);
});

discord.login(config.discord.token);

let mongo: MongoClient;
let store: Storage;

const loadedPlugins: WatchcatPlugin[] = [];

discord.on("guildCreate", (guild: Guild) => {
    guild.owner.user.createDM().then(chan => {
        chan.send("Hey there - I just wanted to help you set up stream notifications for your server." +
            "" +
            "To get started, you will need to define a channel in which updates will be sent. As a server administrator, @mention me from the channel you want me to target.")
    })
});

discord.on("guildDelete", (guild: Guild) => {
    console.log(`Removed from guild ${guild.name} (${guild.id}) -- removing data.`);
    store.guilds().delete(guild);
    store.messages().purgeForGuild(discord, guild);
});

type PRIVILEGE = "OWNER" | "ADMIN" | "USER"

interface Command {
    description: string;
    callable: (msg: Message) => void;
    hidden?: boolean;
    name: string;
    privilege?: PRIVILEGE;
}

interface PluginMatchResult {
    plugin: WatchcatPlugin,
    streamId: string
}

// todo: simplify? use dictionary for loaded plugins so we can key plugin by id maybe
function pluginById(id: string): WatchcatPlugin | null {
    for (let plugin of loadedPlugins) {
        if (plugin.id == id) {
            return plugin;
        }
    }

    return null;
}

function findMatchingPlugin(url: string): PluginMatchResult | null {
    for (let plugin of loadedPlugins) {
        const streamId = plugin.match(url)

        if (streamId) {
            return {plugin, streamId}
        }
    }

    return null;
}

async function clearNotify(guild: Guild, networkId: string, streamId: string) {
    // clear existing notify
    const previous = await store.messages().collection.findOneAndDelete({guildId: guild.id, networkId, streamId});

    if (previous.value) {
        console.log("cleared existing notify for user " + streamId);
        discord.channels.fetch(previous.value.channelId).then(chan => {
            (chan as TextChannel).messages.delete(previous.value.messageId);
        })
    }
}

async function notifyChannel(plugin: WatchcatPlugin, stream: Stream, channel: TextChannel) {
    clearNotify(channel.guild, plugin.id, stream.username);

    console.log("announcing stream in channel " + channel.id);
    const messages = store.messages().collection;

    return channel.send(buildEmbed(stream)).then(message => {
        console.log("announcement success: " + channel.id);
        messages.insertOne({
            channelId: channel.id,
            messageId: message.id,
            guildId: channel.guild.id,
            networkId: plugin.id,
            streamId: stream.username.toLowerCase(),
        })
    });
}

async function notifyAll(plugin: WatchcatPlugin, stream: Stream) {
    const doc = {};
    doc[`networks.${plugin.id}.streams`] = stream.username.toLowerCase();

    store.guilds().collection.find(doc).forEach(async (guild: GuildData) => {
        return notifyChannel(
            plugin,
            stream,
            await discord.channels.fetch(guild.channelId) as TextChannel
        );
    })
}

// sync notify for stream if just watched
function deferredNotify(guild: Guild, plugin: WatchcatPlugin, username: string) {
    const stream = plugin.cachedStream(username);

    if (!stream) {
        // nothing to do
        return;
    }

    store.guilds().get(guild).then(
        async (data) => {
            if (data.channelId) {
                notifyChannel(plugin, stream, await discord.channels.fetch(data.channelId) as TextChannel)
            }
        }
    )
}

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
            store.messages().purgeForChannel(discord, (await discord.channels.fetch(guildInfo.channelId) as TextChannel));
        }

        store.guilds().setChannel(msg.guild, msg.channel.id);

        msg.channel.send(new MessageEmbed()
            .setDescription(`<#${msg.channel.id}> is now set to receive notifications.`)
            .setColor("GREEN"));
    },
    name: "use",
    privilege: "ADMIN"
});

registerCommand({
    description: "Add one or more user(s) to the watchlist.",
    callable: async (msg: Message) => {
        const args = msg.content.split(" ");

        const results = Array.from(new Set(args.slice(2).map(username => username.toLowerCase()))).map(findMatchingPlugin).filter(result => result)

        if (results.length == 0) {
            msg.channel.send(new MessageEmbed().setColor("BLUE").setDescription("**Usage**: watch piczel.tv/watch/user1 picarto.tv/user2 ..."));
            return;
        }

        results.forEach(result => {
            deferredNotify(msg.guild, result.plugin, result.streamId)
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
        const results = Array.from(new Set(args.slice(2).map(username => username.toLowerCase()))).map(findMatchingPlugin);

        if (results.length == 0) {
            msg.channel.send(new MessageEmbed().setColor("BLUE").setDescription("**Usage**: unwatch piczel.tv/watch/user1 picarto.tv/user2 ..."));
            return;
        }

        results.forEach(result => {
            clearNotify(msg.guild, result.plugin.id, result.streamId);
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
        msg.channel.send(new MessageEmbed()
            .setColor("BLUE")
            .setTitle("Loaded Plugins")
            .setDescription(loadedPlugins.map(plugin => `${plugin.name} (${plugin.id})`)))
    },
    hidden: true,
    name: "plugins"
})

registerCommand({
    description: "(Debug) Test regular expression matching for a given stream URL.",
    callable: async (msg: Message) => {
        const args = msg.content.split(" ");
        const result = findMatchingPlugin(args[2]);

        if (result.plugin) {
            msg.channel.send(`Found matching plugin ${result.plugin.name} - ${result.streamId}`)
        } else {
            msg.channel.send(`Can't find matching plugin for ${args[2]}`);
        }
    },
    hidden: true,
    name: "match"
})

registerCommand({
    description: "(Debug) Render a stream title card.",
    callable: async (msg: Message) => {
        const args = msg.content.split(" ");
        const result = findMatchingPlugin(args[2])

        if (!result) {
            msg.channel.send("Can't find a matching plugin")
            return
        }

        const stream = result.plugin.cachedStream(result.streamId);

        if (!stream) {
            msg.channel.send("Can't find this user online")
        } else {
            msg.channel.send(buildEmbed(stream));
        }
    },
    hidden: true,
    name: "card"
});

function buildEmbed(stream: Stream) {
    const footerFrags = [];

    footerFrags.push(pluginById(stream.networkId).name)

    // flag may not exist, so check for null first to avoid labeling sfw
    if (stream.adult != null) {
        footerFrags.push(stream.adult ? "NSFW" : "SFW")
    }

    if (stream.follower_count != null) {
        footerFrags.push(`${stream.follower_count} followers`);
    }

    return new MessageEmbed()
        .setTitle(stream.title || stream.username)
        .setURL(stream.url)
        .setThumbnail(stream.avatar)
        .setTimestamp(Date.parse(stream.live_since))
        .setAuthor(`${stream.username} is live!`, null, stream.url)
        .setImage(stream.preview)
        .setColor("PURPLE")
        .setFooter(footerFrags.join(" | "));
}

registerCommand({
    description: "(Debug) Manual purge of notifications for this server, if there's any lingering ones.",
    callable: async (msg: Message) => {
        store.messages().purgeForGuild(discord, msg.guild);
    },
    hidden: true,
    name: "purge",
    privilege: "OWNER"
});

registerCommand({
    description: "(Debug) Simulate the closure of a stream.",
    callable: async (msg: Message) => {
        const args = msg.content.split(" ");
        const result = findMatchingPlugin(args[2])

        if (!result) {
            msg.channel.send("Can't find a matching plugin")
            return
        }

        store.messages().purgeForStreamer(discord, result.plugin.id, result.streamId);
        const stream = result.plugin.cachedStream(args[2]);
        // todo repair this behaviour!! DO NOT PUSH UNTIL WE FIX THIS
        //piczel.state.splice(piczel.state.indexOf(stream), 1);
    },
    hidden: true,
    name: "sim_stop",
    privilege: "OWNER"
});

registerCommand({
    description: "Grant admin privileges to a given role.",
    callable: async (msg: Message) => {
        const args = msg.content.split(" ");
        const role = msg.guild.roles.resolve(args[2]);

        if (!role) {
            msg.channel.send(new MessageEmbed().setDescription(`Could not find a role matching ID (${role}). Try copying the ID by right-clicking on the role.`).setColor("RED"));
            return;
        }

        store.guilds().grant(msg.guild, role.id);
        msg.channel.send(new MessageEmbed().setDescription(`Granted admin privileges for role **${role.name}**.`).setColor("GREEN"));
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
            msg.channel.send(new MessageEmbed().setDescription(`Revoked admin privileges for this role.`).setColor("GREEN"));
        } else {
            msg.channel.send(new MessageEmbed().setDescription(`Cannot seem to find a role with this ID (${role}). Was it already removed?`).setColor("RED"));
        }
    },
    name: "revoke",
    privilege: "OWNER",
});

registerCommand({
    description: "Display all roles with admin privileges.",
    callable: async (msg: Message) => {
        const guildInfo = await store.guilds().get(msg.guild);

        if (!guildInfo) {
            msg.channel.send(new MessageEmbed()
                .setColor("RED")
                .setTitle("Setup required")
                .setDescription(`Select a channel to receive notifications by using the **use** command.`));
            return;
        }

        const roles = (guildInfo.adminRoles || []).map(id => {
            return {
                id: id,
                object: msg.guild.roles.resolve(id)
            }
        });

        msg.channel.send(new MessageEmbed()
            .setColor("BLUE")
            .setTitle("Admins")
            .setDescription("The following roles are able to use Watchcat admin features on this server.")
            .addField("Roles", roles.map(role => role.object ? `**${role.object.name}** (${role.object.id})` : `(deleted role ${role.id})`).join("\n")));
    },
    name: "admins",
    privilege: "OWNER",
});

registerCommand({
    description: "Get a list of online state.",
    callable: async (msg: Message) => {
        const list = loadedPlugins.map(plugin => plugin.live()).reduce((acc, val) => acc.concat(val), []).sort((a, b) => {
            return a.viewers > b.viewers ? -1 : 1;
        });

        const embed = new MessageEmbed()
            .setColor("BLUE")
            .setTitle("All Services")
            .addField(`Live (${list.length})`, list.slice(0, 10).map(stream => `**${stream.username}** (${stream.viewers}) ${stream.title} ${stream.url}`).join("\n") || "(nobody is broadcasting at the moment.)");

        if (list.length > 10) {
            embed.setFooter(`and ${list.length - 10} others.`);
        }

        msg.channel.send(embed);
    },
    name: "live"
});

registerCommand({
    name: "status",
    description: "View the watchlist, and who is online.",
    callable: async (msg: Message) => {
        const guildInfo = await store.guilds().get(msg.guild);

        if (!guildInfo) {
            msg.channel.send(new MessageEmbed()
                .setColor("RED")
                .setTitle("Setup required")
                .setDescription(`Select a channel to receive notifications by using the **use** command.`));
            return;
        }

        for (let [networkId, data] of Object.entries(guildInfo?.networks)) {
            const userList = (data.streams || []);
            const plugin = pluginById(networkId);

            if (!plugin) {
                console.log("warn: no plugin with ID " + networkId)
                continue;
            }

            const online = userList.filter(user => plugin.cachedStream(user));
            const offline = userList.filter(user => !plugin.cachedStream(user));

            msg.channel.send(new MessageEmbed()
                .setColor("BLUE")
                .setTitle(`Watchcat Status - ${plugin.name}`)
                .setDescription(`Posting stream updates to  <#${guildInfo.channelId}>.`)
                .addField(`Online (${online.length})`, online.map(username => `**${username}** ${plugin.resolveStreamUrl(username)}`).join("\n") || "(empty.)")
                .addField(`Offline (${offline.length})`, offline.map(username => `**${username}** ${plugin.resolveStreamUrl(username)}`).join("\n") || "(empty.)"));
        }

    }
});

function commandToString(command: Command) {
    return `**${command.name}** ${command.description}`;
}

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
                .map(commandToString);
            embed.addField(priv, opts);
        });

        msg.channel.send(embed);
    },
    name: "help"
});

registerCommand({
    description: "Synonym for 'watch'.",
    callable: commands["watch"].callable,
    name: "follow",
    hidden: true,
    privilege: "ADMIN",
});

registerCommand({
    description: "Synonym for 'unwatch'.",
    callable: commands["unwatch"].callable,
    name: "unfollow",
    hidden: true,
    privilege: "ADMIN",
});

registerCommand({
    description: "Synonym for 'use'.",
    callable: commands["use"].callable,
    name: "select",
    hidden: true,
    privilege: "ADMIN",
});

registerCommand({
    description: "Information about this bot.",
    callable: msg => {
        const projectUrl = "https://github.com/fisuku/watchcat";

        msg.channel.send(new MessageEmbed()
            .setColor("BLUE")
            .setTitle("Watchcat - Picarto.tv/Piczel.tv notification service")
            .setDescription(`This bot supplies a push notification service for Discord. Want this bot on your server? Invite it from the project home page.`)
            .addField("Project Home", projectUrl)
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

discord.on("message", async (msg: Message) => {
    if (!msg.mentions.has(discord.user)) {
        // message isn't intended for me
        return;
    }

    if (msg.author.id == discord.user.id) {
        // prevent recursion
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
            msg.channel.send(new MessageEmbed()
                .setColor("RED")
                .setTitle("Insufficient privileges")
                .setDescription("You do not have the rights to use this command."))
        }
    } else {
        console.log("not a command " + command + ", showing help");
        commands["help"].callable(msg);
    }
});

async function setup() {
    mongo = await MongoClient.connect(config.mongo.url);
    store = new Storage(mongo.db(config.mongo.db));

    console.log("Running DB migrations...");
    await runMigrations(store);

    const piczel = new PiczelPlugin(http, store);
    piczel.pollInterval = config.piczel.pullInterval;

    loadedPlugins.push(piczel)

    const picarto = new PicartoClient(http, store);
    picarto.pollInterval = 30000;

    loadedPlugins.push(picarto)
    loadedPlugins.push(new PomfPlugin(http, store))

    loadedPlugins.forEach(plugin => {
        plugin.on("updated", async (streams: Stream[]) => {
            plugin.log(`updating.. (${streams.length} streams available)`)
            store.state().collection.replaceOne({_id: plugin.id}, {streams: streams}, {upsert: true});
        });

        plugin.on("started", (stream: Stream) => {
            plugin.log(`stream ${stream.id} started: ${stream.username}`);
            notifyAll(plugin, stream);
        });

        plugin.on("stopped", (stream: Stream) => {
            plugin.log(`stream ${stream.id} stopped: ${stream.username}`);
            store.messages().purgeForStreamer(discord, plugin.id, stream.username);
        });

        plugin.setup()
        plugin.log("Plugin loaded")
    })
}

setup();