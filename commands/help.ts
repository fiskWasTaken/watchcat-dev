import {Message, MessageEmbed} from "discord.js";
import {Command} from "../commands";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "View this help page.",
        callable: async (msg: Message) => {
            const embed = new MessageEmbed()
                .setTitle("Watchcat")
                .setDescription("Discord stream push notification service. OWNER commands require a user to have the Administrator permission.")
                .setColor("BLUE");

            // owner functions are not in this release
            ["OWNER", "ADMIN", "USER"].forEach(priv => {
                const opts = Object.values(env.commands)
                    .filter(command => !command.hidden)
                    .filter(command => command.privilege == priv)
                    .map((command: Command) => {
                        return `**${command.name}** ${command.description}`;
                    });
                embed.addField(priv, opts);
            });

            await msg.channel.send(embed);
        },
        name: "help"
    }
};