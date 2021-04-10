import {Message, MessageEmbed} from "discord.js";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "(Debug) Get a list of loaded events.",
        callable: async (msg: Message) => {
            await msg.channel.send(new MessageEmbed()
                .setColor("BLUE")
                .setTitle("Loaded Handlers")
                .setDescription(env.handlers.loaded().map(h => `${h.name} (${h.id})`)))
        },
        hidden: true, name: "handlers"
    }
};