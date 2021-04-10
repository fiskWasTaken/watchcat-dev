import {Guild, MessageEmbed} from "discord.js";
import {Env} from "../index";

const projectUrl = "https://github.com/fisuku/watchcat";

module.exports = (env: Env) => {
    return {
        description: "Information about this bot, and the invite link.",
        callable: async (guild: Guild, args: any[]) => {
            return new MessageEmbed()
                .setColor("BLUE")
                .setTitle("Watchcat - stream notification service")
                .setDescription(`This bot supplies a push notification service for Discord. You can add this bot to your server using the invite URL.`)
                .addField("Invite URL", `https://discord.com/api/oauth2/authorize?client_id=${env.config.discord.applicationId}&permissions=2048&scope=bot%20applications.commands`)
                .setURL(projectUrl);
        },
        options: [],
        name: "about",
    };
}