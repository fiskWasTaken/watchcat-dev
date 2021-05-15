import {Guild, MessageEmbed, TextChannel} from "discord.js";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "Designates the specified channel for stream updates.",
        callable: async (guild: Guild, args: any[]) => {
            const guildInfo = await env.store.guilds().get(guild)

            if (!args[0]) {
                return new MessageEmbed()
                    .setDescription(`Please specify a channel (right-click, copy ID with developer mode enabled).`)
                    .setColor("RED");
            }

            const channel = guild.channels.resolve(args[0]);

            if (!channel) {
                return new MessageEmbed()
                    .setDescription(`Could not find channelID ${args[0]}.`)
                    .setColor("RED");
            }

            if (guildInfo && guildInfo.channelId) {
                try {
                    await env.store.messages().purgeForChannel(env.discord, (await env.discord.channels.fetch(guildInfo.channelId) as TextChannel));
                } catch (e) {
                    // channel probably deleted
                }
            }

            await env.store.guilds().setChannel(guild, channel.id);

            return new MessageEmbed()
                .setDescription(`<#${channel.id}> is now set to receive notifications.`)
                .setColor("GREEN");
        },
        name: "use",
        privilege: "ADMIN",
        options: [
            {
                name: "channel",
                description: "channel",
                type: "CHANNEL",
                required: true,
            }
        ],
    };
};