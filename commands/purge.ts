import {Guild} from "discord.js";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "(Debug) Manual purge of notifications for this server, if there's any lingering ones.",
        callable: async (guild: Guild, args: any[]) => {
            await env.store.messages().purgeForGuild(env.discord, guild);
            return "OK";
        },
        hidden: true,
        name: "purge",
        privilege: "OWNER"
    };
};