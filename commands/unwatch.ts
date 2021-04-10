import {Message, MessageEmbed} from "discord.js";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "Remove one or more user(s) from the watchlist.",
        callable: async (msg: Message) => {
            const args = msg.content.split(" ");
            const results = Array.from(new Set(args.slice(2))).map(result => env.handlers.resolveUrl(result));

            if (results.length == 0) {
                await msg.channel.send(new MessageEmbed().setColor("BLUE").setDescription("**Usage**: unwatch piczel.tv/watch/user1 picarto.tv/user2 ..."));
                return;
            }

            results.forEach(result => {
                env.dispatcher.unannounce(msg.guild, result.handler.id, result.streamId);
            });

            Promise.all(results.map((result) => env.store.guilds().unwatch(msg.guild, result.handler.id, result.streamId))).then(results => {
                const modified = results.filter(result => result.modifiedCount > 0).length;
                const unmodified = results.length - modified;
                let result = `${modified} user(s) removed from watchlist.`;

                if (unmodified) {
                    result += ` ${unmodified} user(s) were not present.`;
                }

                msg.channel.send(new MessageEmbed().setColor("GREEN").setDescription(result))
            });
        },
        name: "unwatch",
        privilege: "ADMIN",
    }
};