import {Guild, MessageEmbed} from "discord.js";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "Grant admin privileges to a given role.",
        callable: async (guild: Guild, args: any[]) => {
            const role = guild.roles.resolve(args[0]);

            if (!role) {
                return new MessageEmbed().setDescription(`Could not find a role matching ID (${role}). Try copying the ID by right-clicking on the role.`).setColor("RED");
            }

            await env.store.guilds().grant(guild, role.id);
            return new MessageEmbed().setDescription(`Granted admin privileges for role **${role.name}**.`).setColor("GREEN");
        },
        name: "grant",
        privilege: "OWNER",
        options: [
            {
                name: "role",
                description: "role ID",
                type: "ROLE",
                required: true,
            }
        ],
    };
}
