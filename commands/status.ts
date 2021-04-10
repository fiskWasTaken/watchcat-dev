import {Guild, MessageEmbed} from "discord.js";
import {Env, testGuildStatus} from "../index";

module.exports = (env: Env) => {
    return {
        name: "status",
        description: "View the watchlist, and who is online.",
        options: [
            {
                name: "service",
                description: "service ID",
                type: "STRING",
                required: true,
                choices: env.handlers.loaded().map(h => {
                    return {name: h.name, value: h.id}
                })
            }
        ],
        callable:
            async (guild: Guild, args: any[]) => {
                if (!await testGuildStatus(guild)) return;

                const networkId = args[0];
                const handler = env.handlers.get(networkId);

                const guildInfo = await env.store.guilds().get(guild);
                let pingText = "";

                if (guildInfo.pingRole) {
                    pingText = ` Role <@&${guildInfo.pingRole}> will be pinged.`;
                }

                const data = guildInfo.networks[networkId];

                if (!data) {
                    return new MessageEmbed()
                        .setColor("BLUE")
                        .setTitle("No streams followed")
                        .setDescription(`You have not yet configured the bot to post any streams. Stream updates will be posted to <#${guildInfo.channelId}>.${pingText}`);
                }

                const userList = (data.streams || []);

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

                // todo merge these
                return e;

            }
    }
};