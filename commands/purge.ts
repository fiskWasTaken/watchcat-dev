import {Message} from "discord.js";
import {Env} from "../index";

module.exports = (env: Env) => {
    return {
        description: "(Debug) Manual purge of notifications for this server, if there's any lingering ones.",
        callable: async (msg: Message) => {
            await env.store.messages().purgeForGuild(env.discord, msg.guild);
        },
        hidden: true,
        name: "purge",
        privilege: "OWNER"
    };
};