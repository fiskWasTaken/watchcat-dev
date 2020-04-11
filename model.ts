import {Collection, Db, DeleteWriteOpResultObject} from "mongodb";
import {Client, Guild, Role, TextChannel} from "discord.js";

export interface GuildData {
    _id?: any;
    following: string[];
    channelId?: string;
    adminRoles?: string[];
}

export interface ManagedMessage {
    _id?: any;
    messageId: string;
    channelId: string;
    guildId: string;
    piczelUsername: string;
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

    streams(): Streams {
        return new Streams(this.db.collection<any>("streams"));
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

    watch(guild: Guild, username: string) {
        return this.collection.updateOne(
            {guildId: guild.id},
            {$addToSet: {following: username.toLowerCase()}},
            {upsert: true}
        );
    }

    unwatch(guild: Guild, username: string) {
        return this.collection.updateOne(
            {guildId: guild.id},
            {$pull: {following: username.toLowerCase()}},
            {upsert: true}
        );
    }
}

export class Streams extends Model<any> {

}

export class ManagedMessages extends Model<ManagedMessage> {
    async purge(discord: Client, msg: ManagedMessage) {
        this.collection.deleteOne({_id: msg._id});

        discord.channels.fetch(msg.channelId).then(chan => {
            (chan as TextChannel).messages.delete(msg.messageId, "bot managed");
        });

        console.log("purged managed message " + msg.messageId);
    }

    async purgeForPiczelUser(discord: Client, piczelUsername: string) {
        this.collection.find({piczelUsername: piczelUsername}).forEach(msg => {
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