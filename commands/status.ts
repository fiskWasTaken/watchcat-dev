import {Message, MessageEmbed} from "discord.js";
import {Env, testGuildStatus} from "../index";

module.exports = (env: Env) => {
    return {
        name: "status",
        description: "View the watchlist, and who is online.",
        callable:
            async (msg: Message) => {
                if (!await testGuildStatus(msg)) return;

                const guildInfo = await env.store.guilds().get(msg.guild);

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
                    const handler = env.handlers.get(networkId);

                    if (!handler) {
                        console.log("warn: no handler with ID " + networkId)
                        continue;
                    }

                    const online = userList.filter(user => handler.cachedStream(user));
                    const offline = userList.filter(user => !handler.cachedStream(user));

                    const e = new MessageEmbed()
                        .setColor("BLUE")
                        .setTitle(`Watchcat Status - ${handler.name}`)
                        .setDescription(`Posting stream updates to <#${guildInfo.channelId}>.${pingText}`);

                    if (online.length > 0) {
                        e.addField(`Online (${online.length})`, online.map(username => `**${username}** ${handler.resolveStreamUrl(username)}`).join("\n"));
                    }

                    if (offline.length > 0) {
                        e.addField(`Offline (${offline.length})`, offline.map(username => `**${username}** ${handler.resolveStreamUrl(username)}`).join("\n"));
                    }

                    await msg.channel.send(e);
                }

            }
    }
};