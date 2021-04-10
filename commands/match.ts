import {Message} from "discord.js";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "(Debug) Test regular expression matching for a given stream URL.",
        callable: async (msg: Message) => {
            const args = msg.content.split(" ");
            const result = env.handlers.resolveUrl(args[2]);
            if (result.handler) {
                await msg.channel.send(`Found matching handler ${result.handler.name} - ${result.streamId}`)
            } else {
                await msg.channel.send(`Can't find matching handler for ${args[2]}`);
            }
        }, hidden: true, name: "match"
    };
}