import {Client, Guild, MessageEmbed, TextChannel} from "discord.js";
import {GuildData, Storage} from "./model";
import {Plugin, Stream} from "./plugins/plugin";

export function buildEmbed(plugin: Plugin, stream: Stream) {
    const footerFrags = [plugin.name];

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

export class Dispatcher {
    constructor(private discord: Client, private store: Storage) {
    }

    log(message: string) {
        console.log(`[Dispatcher] ${message}`)
    }

    /**
     * Retract a previous announcement because stream went offline or unwatched
     * todo: find many
     */
    async unannounce(guild: Guild, networkId: string, streamId: string) {
        const previous = await this.store.messages().collection.findOneAndDelete({guildId: guild.id, networkId, streamId});

        if (previous.value) {
            this.log("Cleared existing notify for user " + streamId);
            this.discord.channels.fetch(previous.value.channelId).then(chan => {
                (chan as TextChannel).messages.delete(previous.value.messageId);
            })
        }
    }

    /**
     * Announce stream to channel
     * @param plugin
     * @param stream
     * @param channel
     */
    async announceToChannel(plugin: Plugin, stream: Stream, channel: TextChannel) {
        await this.unannounce(channel.guild, plugin.id, stream.username);

        this.log("Announcing stream in channel " + channel.id);
        const messages = this.store.messages().collection;

        return channel.send(buildEmbed(plugin, stream)).then(message => {
            this.log("Announcement success: " + channel.id);
            messages.insertOne({
                channelId: channel.id,
                messageId: message.id,
                guildId: channel.guild.id,
                networkId: plugin.id,
                streamId: stream.username.toLowerCase(),
            })
        });
    }

    /**
     * Announce online stream to all subscribers
     * @param plugin
     * @param stream
     */
    async announceToAll(plugin: Plugin, stream: Stream) {
        const doc = {};
        doc[`networks.${plugin.id}.streams`] = stream.username;

        this.store.guilds().collection.find(doc).forEach(async (guild: GuildData) => {
            return this.announceToChannel(
                plugin,
                stream,
                await this.discord.channels.fetch(guild.channelId) as TextChannel
            );
        })
    }

    /**
     * announce a deferred notification if this stream was just watched,
     * and it was already online
     * @param guild
     * @param plugin
     * @param username
     */
    announceDeferred(guild: Guild, plugin: Plugin, username: string) {
        const stream = plugin.cachedStream(username);

        if (!stream) {
            // nothing to do
            return;
        }

        this.store.guilds().get(guild).then(
            async (data) => {
                if (data.channelId) {
                    this.announceToChannel(plugin, stream, await this.discord.channels.fetch(data.channelId) as TextChannel)
                }
            }
        )
    }
}