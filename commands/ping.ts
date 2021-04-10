import {Guild, MessageEmbed} from "discord.js";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "Set a role to ping when posting a stream. Send nothing to disable pinging.",
        callable:
            async (guild: Guild, args: any[]) => {
                if (args.length == 0 || args[0] == "") {
                    await env.store.guilds().unsetPingRole(guild);
                    return new MessageEmbed().setDescription(`Pinging disabled.`).setColor("GREEN");
                }

                const role = guild.roles.resolve(args[0]);

                if (!role) {
                    return new MessageEmbed().setDescription(`Could not find a role matching ID (${role}). Try copying the ID by right-clicking on the role.`).setColor("RED");
                }

                await env.store.guilds().setPingRole(guild, role.id);
                return new MessageEmbed().setDescription(`Set ping role to **${role.name}**.`).setColor("GREEN");
            },
        name: "ping",
        privilege: "OWNER",
        options: [
            {
                name: "role",
                description: "role ID",
                type: "ROLE",
                required: false,
            }
        ],
    }
};