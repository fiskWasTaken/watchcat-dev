import {Client, Guild, MessageEmbed, TextChannel} from "discord.js";
import {GuildData, Storage} from "./model";
import {Handler, Stream} from "./handlers/handler";
import color from "colorts";

export function buildEmbed(handler: Handler, stream: Stream) {
    const footerFrags = [handler.name];

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
        console.log(`[${color("Dispatcher").blue}] ${message}`);
    }

    /**
     * Retract a previous announcement because stream went offline or unwatched
     * todo: find many
     */
    async unannounce(guild: Guild, networkId: string, streamId: string) {
        const previous = await this.store.messages().collection.findOneAndDelete({
            guildId: guild.id,
            networkId,
            streamId: {$regex: `^${streamId}$`, $options: 'i'}
        });

        if (previous.value) {
            this.log("Cleared existing notify for user " + streamId);
            this.discord.channels.fetch(previous.value.channelId).then(chan => {
                (chan as TextChannel).messages.delete(previous.value.messageId);
            })
        }
    }

    /**
     * Announce stream to channel
     * @param handler
     * @param stream
     * @param channel
     */
    async announceToChannel(handler: Handler, stream: Stream, channel: TextChannel) {
        await this.unannounce(channel.guild, handler.id, stream.username);

        const messages = this.store.messages().collection;
        const guild = await this.store.guilds().get(channel.guild);

        if (guild.pingRole) {
            // if there's a ping role we just send a message and nuke it right away
            this.log(`Ping role enabled for #${channel.name}, sending ping message for role ${guild.pingRole}`);
            
            channel.send(`${stream.username} is live! <@&${guild.pingRole}>`).then(message => {
                this.log(`Ping message created in #${channel.name} (#${message.id}). Cleaning up...`);
                message.delete();
            });
        }

        return channel.send(buildEmbed(handler, stream)).then(message => {
            this.log(`Announced in ${channel.guild.name} - #${channel.name} (#${message.id})`);

            messages.insertOne({
                channelId: channel.id,
                messageId: message.id,
                guildId: channel.guild.id,
                networkId: handler.id,
                streamId: stream.username,
            })
        });
    }

    /**
     * Announce online stream to all subscribers
     * @param handler
     * @param stream
     */
    async announceToAll(handler: Handler, stream: Stream) {
        const doc = {};
        doc[`networks.${handler.id}.streams`] = {$regex: `^${stream.username}$`, $options: 'i'};

        this.store.guilds().collection.find(doc).forEach(async (guild: GuildData) => {
            return this.announceToChannel(
                handler,
                stream,
                await this.discord.channels.fetch(guild.channelId) as TextChannel
            );
        });
    }

    /**
     * announce a deferred notification if this stream was just watched,
     * and it was already online
     * @param guild
     * @param handler
     * @param username
     */
    announceDeferred(guild: Guild, handler: Handler, username: string) {
        const stream = handler.cachedStream(username);

        if (!stream) {
            // nothing to do
            return;
        }

        this.store.guilds().get(guild).then(
            async (data) => {
                if (data.channelId) {
                    this.discord.channels.fetch(data.channelId).then(channel => {
                        this.announceToChannel(handler, stream, channel as TextChannel);
                    }).catch(reason => {
                        this.log(`${guild.name} (${guild.id} tried to announce to channel ${data.channelId}, but there was an error resolving this channel: ${reason}`);
                    });
                } else {
                    this.log(`${guild.name} (${guild.id} tried to announce, but no channel is configured!`);
                }
            }
        )
    }
}