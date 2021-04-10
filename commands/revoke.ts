import {Guild, MessageEmbed} from "discord.js";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "Revoke admin privileges from a given role.",
        callable: async (guild: Guild, args: any[]) => {
            const role = args[0];

            const result = await env.store.guilds().revoke(guild, role);

            // nb: don't try to naively resolve role here; we might want to remove a deleted role.
            if (result.modifiedCount > 0) {
                return new MessageEmbed().setDescription(`Revoked admin privileges for this role.`).setColor("GREEN");
            } else {
                return new MessageEmbed().setDescription(`Cannot seem to find a role with this ID (${role}). Was it already removed?`).setColor("RED");
            }
        },
        name: "revoke",
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
