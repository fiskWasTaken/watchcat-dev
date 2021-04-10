import {Message, MessageEmbed} from "discord.js";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "Set a role to ping with a self-destructing message when posting a stream. `ping off` to turn this off.",
        callable:
            async (msg: Message) => {
                const args = msg.content.split(" ");

                if (args[2] == "off") {
                    await env.store.guilds().unsetPingRole(msg.guild);
                    await msg.channel.send(new MessageEmbed().setDescription(`Pinging disabled.`).setColor("GREEN"));
                    return;
                }

                const role = msg.guild.roles.resolve(args[2]);

                if (!role) {
                    await msg.channel.send(new MessageEmbed().setDescription(`Could not find a role matching ID (${role}). Try copying the ID by right-clicking on the role.`).setColor("RED"));
                    return;
                }

                await env.store.guilds().setPingRole(msg.guild, role.id);
                await msg.channel.send(new MessageEmbed().setDescription(`Set ping role to **${role.name}**.`).setColor("GREEN"));
            },
        name: "ping",
        privilege: "OWNER"
    }
};