import {Collection, Db, DeleteWriteOpResultObject} from "mongodb";
import {Client, Guild, TextChannel} from "discord.js";
import color from "colorts";

export interface GuildData {
    _id?: any;
    networks: { [key: string]: Network };
    channelId?: string;
    adminRoles?: string[];
    pingRole?: string;
}

export interface Network {
    streams: string[];
}

export interface ManagedMessage {
    _id?: any;
    messageId: string;
    channelId: string;
    guildId: string;
    networkId: string; // unique handler/network ID
    streamId: string; // streamer ID
}

export class Storage {
    constructor(private db: Db) {
        db.collection("guilds").createIndex({"guildId": 1}, {unique: true}).then(_ => {
            // indexes assured
        });
    }

    guilds(): Guilds {
        return new Guilds(this.db.collection<GuildData>("guilds"));
    }

    messages(): ManagedMessages {
        return new ManagedMessages(this.db.collection<ManagedMessage>("managedMessages"));
    }
}

export class Model<T> {
    constructor(public collection: Collection<T>) {
    }
}

export class Guilds extends Model<GuildData> {
    get(guild: Guild): Promise<GuildData> {
        return this.collection.findOne({guildId: guild.id});
    }

    delete(guild: Guild): Promise<DeleteWriteOpResultObject> {
        return this.collection.deleteOne({guildId: guild.id});
    }

    setChannel(guild: Guild, channelId: string) {
        return this.collection.updateOne(
            {guildId: guild.id},
            {$set: {channelId: channelId}},
            {upsert: true}
        );
    }

    setPingRole(guild: Guild, roleId: string) {
        return this.collection.updateOne(
            {guildId: guild.id},
            {$set: {pingRole: roleId}},
            {upsert: true}
        );
    }

    unsetPingRole(guild: Guild) {
        return this.collection.updateOne(
            {guildId: guild.id},
            {$unset: {pingRole: 1}},
            {upsert: true}
        );
    }

    grant(guild: Guild, roleId: string) {
        return this.collection.updateOne(
            {guildId: guild.id},
            {$addToSet: {adminRoles: roleId}},
            {upsert: true}
        );
    }

    revoke(guild: Guild, roleId: string) {
        return this.collection.updateOne(
            {guildId: guild.id},
            {$pull: {adminRoles: roleId}},
            {upsert: true}
        );
    }

    watch(guild: Guild, networkId: string, username: string) {
        const doc = {};
        doc[`networks.${networkId}.streams`] = username;

        return this.collection.updateOne(
            {guildId: guild.id},
            {$addToSet: doc},
            {upsert: true}
        );
    }

    unwatch(guild: Guild, networkId: string, username: string) {
        const doc = {};
        doc[`networks.${networkId}.streams`] = username;

        return this.collection.updateOne(
            {guildId: guild.id},
            {$pull: doc},
            {upsert: true}
        );
    }
}

export class ManagedMessages extends Model<ManagedMessage> {
    async purge(discord: Client, msg: ManagedMessage) {
        await this.collection.deleteOne({_id: msg._id});

        try {
            const chan = await discord.channels.fetch(msg.channelId) as TextChannel;
            await chan.messages.delete(msg.messageId);
            this.log(`Deleted previous announcement in ${chan.name} (${msg.messageId}).`);
        } catch (e) {
            this.log(`Managed message (${msg.messageId}) was already deleted, or the channel was removed.`)
        }
    }

    log(message: string) {
        console.log(`[${color("Management").blue}] ${message}`);
    }

    async purgeForStreamer(discord: Client, networkId: string, streamId: string) {
        await this.collection.find({networkId: networkId, streamId: streamId}).forEach(msg => {
            this.purge(discord, msg);
        });
    }

    async purgeForChannel(discord: Client, channel: TextChannel) {
        await this.collection.find({channelId: channel.id}).forEach(msg => {
            this.purge(discord, msg)
        });
    }

    async purgeForGuild(discord: Client, guild: Guild) {
        await this.collection.find({guildId: guild.id}).forEach(msg => {
            this.purge(discord, msg)
        });
    }
}