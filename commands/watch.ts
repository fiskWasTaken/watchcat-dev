import {Guild, MessageEmbed} from "discord.js";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "Add one or more user(s) to the watchlist.",
        callable: async (guild: Guild, args: any[]) => {
            const results = Array.from(new Set(args)).map(result => env.handlers.resolveUrl(result)).filter(result => result)

            if (results.length == 0) {
                return new MessageEmbed().setColor("BLUE").setDescription("**Usage**: watch piczel.tv/watch/user1 picarto.tv/user2 ...");
            }

            results.forEach(result => {
                env.dispatcher.announceDeferred(guild, result.handler, result.streamId)
            });

            const res = await Promise.all(results.map((result) => env.store.guilds().watch(guild, result.handler.id, result.streamId)));

            const modified = res.filter(result => result.modifiedCount > 0).length;
            const unmodified = res.length - modified;
            let result = `${modified} user(s) added to watchlist.`;

            if (unmodified) {
                result += ` ${unmodified} user(s) were already present.`;
            }

            return new MessageEmbed().setColor("GREEN").setDescription(result);
        },
        name: "watch",
        privilege: "ADMIN",
        options: [
            {
                name: "url",
                description: "full stream URL",
                type: "STRING",
                required: true,
            }
        ],
    };
};