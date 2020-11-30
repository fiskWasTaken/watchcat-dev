import {Stream, WatchcatPlugin, PluginEvents} from "./plugin";
import {AxiosInstance} from "axios";
import {GuildData, Storage} from "../model";

/**
 * important URLs
 *
 * - https://pomf.tv/include/checklive.php?stream=SmogProf
 * - returns 1 or 0, case insensitive
 *
 * - https://pomf.tv/include/_viewcount.php?stream=NexGenCN
 * - returns viewer count
 *
 * - strategy: collaborate all pomf users in database, and fire off
 */

export class PomfPlugin extends WatchcatPlugin {
    public streams: Stream[] = [];
    public pollInterval = 30000;

    cachedStream(username: string): Stream|null {
        return this.streams.filter((stream: Stream) => {
            return stream.username.toLowerCase() == username.toLowerCase();
        })[0];
    }

    live(): Stream[] {
        return this.streams;
    }

    match(url: string): string | null {
        const res = url.match(/pomf\.tv\/stream\/(.*)$/i);
        return res?.length > 0 ? res[1] : null;
    }

    async setup() {
        const contents = await this.store.state().collection.findOne({_id: this.id});
        this.streams = (contents && contents.streams || []) as Stream[];
        this.log(`Resuming from previous state, ${this.streams.length} streams in store.`);
        this.watch(this.pollInterval);
    }

    watch(interval: number = 3600) {
        this.update();

        setInterval(() => {
            this.update()
        }, interval)
    }

    async checkOnlineStatus(username: string) {
        return this.http.get("https://pomf.tv/include/checklive.php", {
            params: {
                stream: username
            },
        });
    }

    resolveStreamUrl(username: string): string {
        return `https://pomf.tv/stream/${username}`
    }

    async update(): Promise<any> {
        // step one: concatenate our target users to make requests for
        // todo: use mongo aggregate (nobody really uses this bot atm so w/e)
        const doc = {"networks.pomf_tv.streams": {$exists: true}};
        const collect = new Set<string>()

        await this.store.guilds().collection.find(doc).forEach(async (guild: GuildData) => {
            for (const stream of guild.networks.pomf_tv.streams) {
                collect.add(stream)
            }
        })

        this.log(`${collect.size} user(s) for which to perform update.`)

        // step two: test online status of each
        for (const user of Array.from(collect)) {
            const status = (await this.checkOnlineStatus(user)).data
            const known = this.cachedStream(user)

            if (status==="") {
                // user does not exist -- do something maybe?
                this.log(`Trying to track ${user}, but they don't seem to exist.`)
            } else if (status=="0") {
                if (known) {
                    this.log(`${user} is now offline.`)
                    this.handlers["stopped"](known)
                    this.streams.splice(this.streams.indexOf(known), 1)
                }
            } else if (status=="1") {
                if (!known) {
                    this.log(`${user} is now online.`)
                    const doc = {
                        id: 1337,
                        username: user,
                        url: this.resolveStreamUrl(user),
                        networkId: "pomf_tv",
                        source: {}
                    }

                    this.streams.push(doc)
                    this.handlers["started"](doc)
                }
            } else {
                // no fucking idea what this is
                this.log(`Warn: unexpected status for user ${user}: ${status}`)
            }
        }

        this.handlers["updated"](this.streams)
    }

    constructor(private http: AxiosInstance, private store: Storage) {
        super("Pomf.TV", "pomf_tv")
    }

    /**
     * test the specified user exists and return a response
     * for pomf we just check the online status,
     * it is merely empty for a nonexistent user
     * @param username
     */
    async checkUsernameValidity(username: string): Promise<boolean> {
        const online = await this.checkOnlineStatus(username)
        return online.data!=""
    }
}