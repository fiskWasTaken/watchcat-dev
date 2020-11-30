import {Collection, Db, DeleteWriteOpResultObject} from "mongodb";
import {Client, Guild, Role, TextChannel} from "discord.js";

export interface GuildData {
    _id?: any;
    networks: {[key: string]: Network};
    channelId?: string;
    adminRoles?: string[];
}

export interface Network {
    streams: string[];
}

export interface ManagedMessage {
    _id?: any;
    messageId: string;
    channelId: string;
    guildId: string;
    networkId: string; // unique plugin/network ID
    streamId: string; // streamer ID
}

export class Storage {
    constructor(private db: Db) {
        db.collection("guilds").createIndex({"guildId": 1}, {unique: true})
    }

    guilds(): Guilds {
        return new Guilds(this.db.collection<GuildData>("guilds"));
    }

    messages(): ManagedMessages {
        return new ManagedMessages(this.db.collection<ManagedMessage>("managedMessages"));
    }

    state(): State {
        return new State(this.db.collection<any>("state"));
    }
}

export class Model<T> {
    constructor(public collection: Collection<T>) {}
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

export class State extends Model<any> {

}

export class ManagedMessages extends Model<ManagedMessage> {
    async purge(discord: Client, msg: ManagedMessage) {
        this.collection.deleteOne({_id: msg._id});

        discord.channels.fetch(msg.channelId).then(chan => {
            (chan as TextChannel).messages.delete(msg.messageId, "bot managed");
        });

        console.log("purged managed message " + msg.messageId);
    }

    async purgeForStreamer(discord: Client, networkId: string, streamId: string) {
        this.collection.find({networkId: networkId, streamId: streamId}).forEach(msg => {
            this.purge(discord, msg);
        });
    }

    async purgeForChannel(discord: Client, channel: TextChannel) {
        this.collection.find({channelId: channel.id}).forEach(msg => {
            this.purge(discord, msg)
        });
    }

    async purgeForGuild(discord: Client, guild: Guild) {
        this.collection.find({guildId: guild.id}).forEach(msg => {
            this.purge(discord, msg)
        });
    }
}