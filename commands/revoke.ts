import {Message, MessageEmbed} from "discord.js";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "Revoke admin privileges from a given role.",
        callable: async (msg: Message) => {
            const args = msg.content.split(" ");
            const role = args[2];

            const result = await env.store.guilds().revoke(msg.guild, role);

            // nb: don't try to naively resolve role here; we might want to remove a deleted role.
            if (result.modifiedCount > 0) {
                await msg.channel.send(new MessageEmbed().setDescription(`Revoked admin privileges for this role.`).setColor("GREEN"));
            } else {
                await msg.channel.send(new MessageEmbed().setDescription(`Cannot seem to find a role with this ID (${role}). Was it already removed?`).setColor("RED"));
            }
        },
        name: "revoke",
        privilege: "OWNER",
    };
}
