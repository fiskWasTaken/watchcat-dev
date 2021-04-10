import {MessageEmbed} from "discord.js";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "Information about this bot, and the invite link.",
        callable: async msg => {
            const projectUrl = "https://github.com/fisuku/watchcat";

            await msg.channel.send(new MessageEmbed()
                .setColor("BLUE")
                .setTitle("Watchcat - stream notification service")
                .setDescription(`This bot supplies a push notification service for Discord. You can add this bot to your server using the invite URL.`)
                .addField("Invite URL", env.config.discord.inviteUrl)
                .setURL(projectUrl));
        },
        name: "about",
    };
}