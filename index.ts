import {PiczelStream, PiczelClient} from "./piczel";
import {Channel, Client, Guild, Message, MessageEmbed, Permissions, TextChannel} from "discord.js";
import {Collection, Db, MongoCallback, MongoClient, MongoError} from "mongodb";

const config = require("./config.json");
const discord = new Client();

const http = require("axios").default.create({
    headers: {
        "User-Agent": "piczelD by fisk#8729"
    }
});

interface GuildData {
    _id?: any;
    following: string[];
    channelId?: string;
}

interface ManagedMessage {
    _id?: any;
    messageId: string;
    channelId: string;
    guildId: string;
    piczelUsername: string;
}

discord.on("ready", () => {
    console.log(`Logged in as ${discord.user.tag}!`);
});

discord.login(config.discord.token);

let mongo: MongoClient;

async function mongoDb(): Promise<Db> {
    return mongo.db(config.mongo.db)
}

async function guilds(): Promise<Collection<GuildData>> {
    return mongoDb().then(db => {
        return db.collection<GuildData>("guilds");
    });
}

async function managedMessages(): Promise<Collection<ManagedMessage>> {
    return mongoDb().then(db => {
        return db.collection<ManagedMessage>("managedMessages");
    });
}

async function streams(): Promise<Collection> {
    return mongoDb().then(db => {
        return db.collection("streams");
    })
}

async function setChannel(guild: Guild, channelId: string) {
    return (await guilds()).updateOne(
        {guildId: guild.id},
        {$set: {channelId: channelId}},
        {upsert: true}
    );
}

async function follow(guild: Guild, username: string) {
    return (await guilds()).updateOne(
        {guildId: guild.id},
        {$addToSet: {following: username.toLowerCase()}},
        {upsert: true}
    );
}

async function unfollow(guild: Guild, username: string) {
    return (await guilds()).updateOne(
        {guildId: guild.id},
        {$pull: {following: username.toLowerCase()}},
        {upsert: true}
    );
}

async function getGuildData(guild: Guild): Promise<GuildData> {
    return (await guilds()).findOne({guildId: guild.id});
}

async function clearGuildData(guild: Guild) {
    return (await guilds()).deleteOne({guildId: guild.id});
}

const piczel = new PiczelClient(http);

piczel.on("updated", async (strams: PiczelStream[]) => {
    console.log(`updating.. (${strams.length} streams available)`)
    const collection = await streams();
    collection.replaceOne({_id: "current"}, {streams: strams}, {upsert: true});
});

piczel.on("started", (stream: PiczelStream) => {
    console.log(`stream ${stream.id} started: ${stream.username}`);
    announce(stream);
});

piczel.on("stopped", (stream: PiczelStream) => {
    console.log(`stream ${stream.id} stopped: ${stream.username}`);
    purgePiczelMessages(stream.username);
});

discord.on("guildCreate", (guild: Guild) => {
    guild.owner.user.createDM().then(chan => {
        chan.send("Hey there - I just wanted to help you set up Piczel notifications for your server." +
            "" +
            "To get started, you will need to define a channel in which updates will be sent. As a server administrator, @mention me from the channel you want me to target.")
    })
});

discord.on("guildDelete", (guild: Guild) => {
    console.log(`Removed from guild ${guild.name} (${guild.id}) -- removing data.`);
    clearGuildData(guild);
    purgeGuildMessages(guild);
});

interface Command {
    description: string;
    callable: (msg: Message) => void;
    hidden?: boolean;
    name: string;
}

async function purgeManagedMessage(msg: ManagedMessage) {
    const collection = await managedMessages();
    collection.deleteOne({_id: msg._id});
    discord.channels.fetch(msg.channelId).then(chan => {
        (chan as TextChannel).messages.delete(msg.messageId, "bot managed");
    });

    console.log("purged managed message " + msg.messageId);
}

async function purgePiczelMessages(piczelUsername: string) {
    const collection = await managedMessages();

    collection.find({piczelUsername: piczelUsername}).forEach(msg => {
        purgeManagedMessage(msg);
    });
}

async function purgeChannelMessages(channel: TextChannel) {
    const collection = await managedMessages();

    collection.find({channelId: channel.id}).forEach(msg => {
        purgeManagedMessage(msg)
    });
}

async function purgeGuildMessages(guild: Guild) {
    const collection = await managedMessages();

    collection.find({guildId: guild.id}).forEach(msg => {
        purgeManagedMessage(msg)
    });
}

function buildEmbed(stream: PiczelStream) {
    const streamUrl = `https://piczel.tv/watch/${stream.username}`;
    const streamPreview = `https://piczel.tv/screenshots/stream_${stream.id}.jpg`;

    return new MessageEmbed()
        .setTitle(stream.title)
        .setURL(streamUrl)
        .setThumbnail(stream.user.avatar.url)
        .setTimestamp(Date.parse(stream.live_since))
        .setAuthor(`${stream.username} is live!`, null, streamUrl)
        .setImage(streamPreview)
        .setFooter(`${stream.adult ? "NSFW" : "SFW"} | ${stream.follower_count} followers`);
}

async function announceForChannel(stream: PiczelStream, channel: TextChannel) {
    const messages = await managedMessages();
    console.log("announcing stream in channel " + channel.id);

    return channel.send(buildEmbed(stream)).then(message => {
        console.log("announcement success: " + channel.id);
        messages.insertOne({
            channelId: channel.id,
            messageId: message.id,
            guildId: channel.guild.id,
            piczelUsername: stream.username,
        })
    });
}

async function announce(stream: PiczelStream) {
    const collection = await guilds();

    collection.find({following: stream.username.toLowerCase()}).forEach(async (guild: GuildData) => {
        return announceForChannel(
            stream,
            await discord.channels.fetch(guild.channelId) as TextChannel
        );
    })
}

const commands: { [key: string]: Command } = {};

function registerCommand(command: Command) {
    commands[command.name] = command;
}

registerCommand({
    description: "Designates a channel for stream updates.",
    callable: async (msg: Message) => {
        const guildInfo = await getGuildData(msg.guild);

        if (guildInfo && guildInfo.channelId) {
            purgeChannelMessages(await discord.channels.fetch(guildInfo.channelId) as TextChannel)
        }

        setChannel(msg.guild, msg.channel.id);
        msg.channel.send(`<#${msg.channel.id}> will now receive stream updates.`)
    },
    name: "select"
});

registerCommand({
    description: "Follow one or more users.",
    callable: async (msg: Message) => {
        const args = msg.content.split(" ");
        const usernames = Array.from(new Set(args.slice(2)));

        if (usernames.length == 0) {
            msg.channel.send("To use this command, supply a space-delimited list of users you want to follow.")
        }

        Promise.all(usernames.map((username) => follow(msg.guild, username))).then(results => {
            const modified = results.filter(result => result.modifiedCount > 0).length;
            const unmodified = usernames.length - modified;
            let result = `${modified} user(s) were followed.`;

            if (unmodified) {
                result += ` ${unmodified} user(s) were already being followed.`;
            }

            // todo: update immediately
            result += ` Notifications will appear the next time the user is online.`;

            msg.channel.send(result);
        });
    },
    name: "follow",
});

registerCommand({
    description: "Unfollow one or more users.",
    callable: async (msg: Message) => {
        const args = msg.content.split(" ");
        const usernames = Array.from(new Set(args.slice(2)));

        if (usernames.length == 0) {
            msg.channel.send("To use this command, supply a space-delimited list of users you want to follow.")
        }

        Promise.all(usernames.map((username) => unfollow(msg.guild, username))).then(results => {
            const modified = results.filter(result => result.modifiedCount > 0).length;
            const unmodified = usernames.length - modified;
            let result = `${modified} user(s) were unfollowed.`;

            if (unmodified) {
                result += ` ${unmodified} user(s) were already unfollowed.`;
            }

            msg.channel.send(result);
        });
    },
    name: "unfollow"
});

registerCommand({
    description: "Debug method to display stream title card.",
    callable: async (msg: Message) => {
        const args = msg.content.split(" ");
        const stream = piczel.cachedStream(args[2]);

        if (!stream) {
            msg.channel.send("Can't find this user online")
        } else {
            msg.channel.send(buildEmbed(stream));
        }
    },
    hidden: true,
    name: "card"
});

registerCommand({
    description: "(Debug) Manual purge of notifications for this server, if there's any lingering ones..",
    callable: async (msg: Message) => {
        purgeGuildMessages(msg.guild);
    },
    hidden: true,
    name: "purge"
});

registerCommand({
    description: "get a list of online streams.",
    callable: async (msg: Message) => {
        const list = piczel.streams.map(key => {
            return `\`${key.username}\` ${key.title}`
        });

        msg.channel.send(list)
    },
    hidden: true,
    name: "live"
});

registerCommand({
    name: "status",
    description: "Get an overview of the current server configuration.",
    callable: async (msg: Message) => {
        const guildInfo = await getGuildData(msg.guild);

        if (!guildInfo) {
            msg.channel.send("I have not been correctly configured for this server. Start by selecting a channel for updates:\n> <@${discord.user.id}> select")
        }

        const userList = (guildInfo.following || []).map(username => `\`${username}\``).join("\n");

        let userText;

        if (userList.length > 0) {
            userText = userList;
        } else {
            userText = `I am not currently following any users. Start by adding someone to follow:\n> <@${discord.user.id}> follow \`piczel username\``;
        }

        msg.channel.send(`
I am currently posting stream updates in <#${guildInfo.channelId}> for the following users:
${userText}
`);
    }
});

registerCommand({
    description: "(Debug) Simulate the closure of a stream.",
    callable: async (msg: Message) => {
        const args = msg.content.split(" ");
        const stream = piczel.cachedStream(args[2]);
        piczel.streams.splice(piczel.streams.indexOf(stream), 1);
        purgePiczelMessages(stream.username);
    },
    hidden: true,
    name: "sim_stop"
});

registerCommand({
    description: "See this help page.",
    callable: async (msg: Message) => {
        const options = Object.values(commands)
            .filter(command => !command.hidden)
            .map(command => `\`${command.name}\` ${command.description}`);

        msg.channel.send("To use this bot, @mention me and type your command.\n" + options.join("\n"));
    },
    name: "help"
});

function hasSendMessagePrivilege(channel: TextChannel) {
    return channel.guild.member(discord.user).permissionsIn(channel).has("SEND_MESSAGES");
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

    if (!msg.guild.member(msg.author).hasPermission("ADMINISTRATOR")) {
        msg.channel.send(`Please ask your server administrator to configure this bot.`);
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
        commands[command].callable(msg);
    } else {
        console.log("not a command " + command + ", showing help");
        commands["help"].callable(msg);
    }
});

async function setup() {
    mongo = await MongoClient.connect(config.mongo.url);
    const db = await mongoDb();
    db.collection("guilds").createIndex({"guildId": 1}, {unique: true})

    const collection = await streams();
    const contents = await collection.findOne({_id: "current"});
    piczel.streams = (contents && contents.streams || []) as PiczelStream[];
    console.log(`Resuming from previous state, ${piczel.streams.length} streams in store.`);
    piczel.watch(config.piczel.pullInterval);
}

setup();