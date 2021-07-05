import {Guild} from "discord.js";
import {Env} from "../index";

function choose(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = (env: Env) => {
    return {
        description: ":3",
        callable: async (guild: Guild, args: any[]) => {
            const words = ["nyaaa", "meow", "nyan"];
            const emoji = ["=w=", "^w^", ":3", ":33", ":333", ";3", "=w=", "@w@", "@w@;"];

            return `${choose(words)} ${choose(emoji)}`;
        },
        name: "meow",
        options: [],
    }
};