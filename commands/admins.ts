import {Guild, MessageEmbed} from "discord.js";
import {Env, testGuildStatus} from "../index";

module.exports = (env: Env) => {
    return {
        description: "Display all roles with admin privileges.",
        callable: async (guild: Guild, args: any[]) => {
            if (!await testGuildStatus(guild)) return;

            const guildInfo = await env.store.guilds().get(guild);
            const roles = (guildInfo.adminRoles || []).map(id => {
                return {
                    id: id,
                    object: guild.roles.resolve(id)
                }
            });

            return new MessageEmbed()
                .setColor("BLUE")
                .setTitle("Admins")
                .setDescription("The following roles are able to use Watchcat admin features on this server.")
                .addField("Roles", roles.map(role => role.object ? `**${role.object.name}** (${role.object.id})` : `(deleted role ${role.id})`).join("\n"));
        },
        name: "admins",
        options: [],
        privilege: "OWNER",
    }
}