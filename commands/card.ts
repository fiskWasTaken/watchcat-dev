import {Guild} from "discord.js";
import {buildEmbed} from "../dispatcher";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "(Debug) Render a stream title card.",
        callable: async (guild: Guild, args: any[]) => {
            const result = env.handlers.resolveUrl(args[0])

            if (!result) {
                return "Can't find a matching handler"
            }

            const stream = result.handler.cachedStream(result.streamId);

            if (!stream) {
                return "Can't find this user online"
            } else {
                return buildEmbed(result.handler, stream);
            }
        },
        hidden: true,
        name: "card"
    }
};