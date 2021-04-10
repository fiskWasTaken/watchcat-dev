import {Guild, MessageEmbed} from "discord.js";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "(Debug) Get a list of loaded events.",
        callable: async (guild: Guild, args: any[]) => {
            return new MessageEmbed()
                .setColor("BLUE")
                .setTitle("Loaded Handlers")
                .setDescription(env.handlers.loaded().map(h => `${h.name} (${h.id})`));
        },
        hidden: true, name: "handlers"
    }
};