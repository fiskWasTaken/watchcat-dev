import {Message, MessageEmbed} from "discord.js";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "Grant admin privileges to a given role.",
        callable: async (msg: Message) => {
            const args = msg.content.split(" ");
            const role = msg.guild.roles.resolve(args[2]);

            if (!role) {
                await msg.channel.send(new MessageEmbed().setDescription(`Could not find a role matching ID (${role}). Try copying the ID by right-clicking on the role.`).setColor("RED"));
                return;
            }

            await env.store.guilds().grant(msg.guild, role.id);
            await msg.channel.send(new MessageEmbed().setDescription(`Granted admin privileges for role **${role.name}**.`).setColor("GREEN"));
        },
        name: "grant",
        privilege: "OWNER",
    };
}
