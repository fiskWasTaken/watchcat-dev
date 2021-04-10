import {Guild, MessageEmbed} from "discord.js";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "Remove one or more user(s) from the watchlist.",
        callable: async (guild: Guild, args: any[]) => {
            const results = Array.from(new Set(args)).map(result => env.handlers.resolveUrl(result));

            if (results.length == 0) {
                return new MessageEmbed().setColor("BLUE").setDescription("**Usage**: unwatch piczel.tv/watch/user1 picarto.tv/user2 ...");
            }

            results.forEach(result => {
                env.dispatcher.unannounce(guild, result.handler.id, result.streamId);
            });

            const res = await Promise.all(results.map((result) => env.store.guilds().unwatch(guild, result.handler.id, result.streamId)));

            const modified = res.filter(result => result.modifiedCount > 0).length;
            const unmodified = res.length - modified;

            let result = `${modified} user(s) removed from watchlist.`;

            if (unmodified) {
                result += ` ${unmodified} user(s) were not present.`;
            }

            return new MessageEmbed().setColor("GREEN").setDescription(result)
        },
        name: "unwatch",
        privilege: "ADMIN",
        options: [
            {
                name: "url",
                description: "full stream URL",
                type: "STRING",
                required: true,
            }
        ],
    }
};