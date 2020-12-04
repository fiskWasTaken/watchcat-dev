// generic streamer interface we expect plugins to conform to
import color from 'colorts';

import {AxiosInstance} from "axios";
import {Express, Request, Response} from "express";
import {Db} from "mongodb";
import {GuildData, Storage} from "../model";

export interface Stream {
    id: number;
    title?: string;
    description?: string;
    follower_count?: number;
    live_since?: string;
    isPrivate?: boolean;
    adult?: boolean;
    in_multi?: boolean;
    viewers?: number;
    username: string;
    networkId: string;
    source: any;
    avatar?: string; // user avatar
    preview?: string; // preview image of stream if available
    url: string; // stream url
}

export interface PluginEvents {
    started?: (stream: Stream) => void;
    stopped?: (stream: Stream) => void;
    updated?: (streams: Stream[]) => void;
}

export abstract class Plugin {
    /**
     * config vars set in config.json for this plugin
     */
    protected config: any;
    protected http: AxiosInstance;
    protected db: Db;
    protected handlers: PluginEvents = {};

    protected constructor(public name, public id) {
        this.handlers.started = (_: Stream) => null;
        this.handlers.stopped = (_: Stream) => null;
        this.handlers.updated = (_: Stream[]) => null;
        this.http = require("axios").default.create();
    }

    onWebhookEvent(req: Request, res: Response) {
        this.log("Webhook event received");
        res.send("ok")
    }

    onUserWatched(username: string) {
        // todo ensure this is called
    }

    onUserUnwatched(username: string) {
        // todo ensure this is called
    }

    setBackend(db: Db) {
        this.db = db;
    }

    setTransport(http: AxiosInstance) {
        this.http = http;
    }

    setConfig(config: any) {
        this.config = config;
    }

    createWebhook(app: Express) {
        app.get(`/webhooks/${this.id}`, (req, res) => {
            this.onWebhookEvent(req, res)
        });
    }

    /**
     * log plugin message to stdout or whatever
     * @param data
     */
    log(data: string): void {
        console.log(`[${color(this.name).magenta}] ${data}`);
    }

    on(event, func) {
        this.handlers[event] = func;
    }

    /**
     * base username validity function, override to check logic when
     * adding users, etc
     * @param username
     */
    async checkUsernameValidity(username: string): Promise<boolean> {
        return true
    }

    /**
     * ready, do we need to set up state?
     */
    async ready() {
    }

    /**
     * test this client to see if it can handle a given url
     */
    abstract match(url: string): string | null

    abstract cachedStream(streamId: string): Stream;

    /**
     * Return appropriate stream url for this user
     * @param username
     */
    abstract resolveStreamUrl(username: string): string

    /**
     * Return an array of all users the bot follows, from all guilds
     */
    async globalFollows() {
        // todo: use mongo aggregate (nobody really uses this bot atm so w/e)
        const collect = new Set<string>()
        const doc = {}
        doc[`networks.${this.id}.streams`] = {$exists: true};

        await new Storage(this.db).guilds().collection.find(doc).forEach(async (guild: GuildData) => {
            for (const stream of guild.networks[this.id].streams) {
                collect.add(stream)
            }
        })

        return Array.from(collect);
    }
}

