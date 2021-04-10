import {Guild, MessageEmbed} from "discord.js";

export type PRIVILEGE = "OWNER" | "ADMIN" | "USER"

export interface Command {
    description: string;
    callable: (guild: Guild, args: any[]) => string | MessageEmbed;
    hidden?: boolean;
    name: string;
    privilege?: PRIVILEGE;
    options?: any[];
}