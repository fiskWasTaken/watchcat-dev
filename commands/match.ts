import {Guild} from "discord.js";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "(Debug) Test regular expression matching for a given stream URL.",
        callable: async (guild: Guild, args: any[]) => {
            const result = env.handlers.resolveUrl(args[0]);
            if (result.handler) {
                return `Found matching handler ${result.handler.name} - ${result.streamId}`
            } else {
                return `Can't find matching handler for ${args[0]}`;
            }
        }, hidden: true, name: "match"
    };
}