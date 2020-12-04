import {Message} from "discord.js";

export type PRIVILEGE = "OWNER" | "ADMIN" | "USER"

export interface Command {
    description: string;
    callable: (msg: Message) => void;
    hidden?: boolean;
    name: string;
    privilege?: PRIVILEGE;
}