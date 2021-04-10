import {Message, MessageEmbed, TextChannel} from "discord.js";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "Designates the specified channel for stream updates.",
        callable: async (msg: Message) => {
            const guildInfo = await env.store.guilds().get(msg.guild)
            const args = msg.content.split(" ");

            if (!args[2]) {
                await msg.channel.send(new MessageEmbed()
                    .setDescription(`Please specify a channel (right-click, copy ID with developer mode enabled).`)
                    .setColor("RED"));
                return;
            }

            const channel = msg.guild.channels.resolve(args[2]);

            if (!channel) {
                await msg.channel.send(new MessageEmbed()
                    .setDescription(`Could not find channelID ${args[2]}.`)
                    .setColor("RED"));
                return;
            }

            if (guildInfo && guildInfo.channelId) {
                await env.store.messages().purgeForChannel(env.discord, (await env.discord.channels.fetch(guildInfo.channelId) as TextChannel));
            }

            env.store.guilds().setChannel(msg.guild, channel.id).then(() => {
                msg.channel.send(new MessageEmbed()
                    .setDescription(`<#${channel.id}> is now set to receive notifications.`)
                    .setColor("GREEN"));
            });
        },
        name: "use",
        privilege: "ADMIN"
    };
};