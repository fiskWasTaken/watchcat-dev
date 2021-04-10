import {Message} from "discord.js";
import {buildEmbed} from "../dispatcher";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "(Debug) Render a stream title card.",
        callable: async (msg: Message) => {
            const args = msg.content.split(" ");
            const result = env.handlers.resolveUrl(args[2])

            if (!result) {
                await msg.channel.send("Can't find a matching handler")
                return
            }

            const stream = result.handler.cachedStream(result.streamId);

            if (!stream) {
                await msg.channel.send("Can't find this user online")
            } else {
                await msg.channel.send(buildEmbed(result.handler, stream));
            }
        },
        hidden: true,
        name: "card"
    }
};