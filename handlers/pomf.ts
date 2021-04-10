import {PollingHandler} from "./polling";

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

export default class PomfHandler extends PollingHandler {
    constructor(config: { [key: string]: any }) {
        super(config, "Pomf.TV", "pomf_tv")
    }

    match(url: string): string | null {
        const res = url.match(/pomf\.tv\/stream\/(.*)$/i);
        return res?.length > 0 ? res[1] : null;
    }

    async checkOnlineStatus(username: string) {
        return this.http.get("https://pomf.tv/include/checklive.php", {
            params: {
                stream: username,
            },
        });
    }

    resolveStreamUrl(username: string): string {
        return `https://pomf.tv/stream/${username}`
    }

    async poll(): Promise<any> {
        // step one: concatenate our target users to make requests for
        const collect = await this.globalFollows();
        this.log(`${collect.length} user(s) for which to perform update.`)

        // step two: test online status of each
        for (const user of collect) {
            const status = (await this.checkOnlineStatus(user)).data
            const known = this.cachedStream(user)

            if (status === "") {
                // user does not exist -- do something maybe?
                this.log(`Trying to track ${user}, but they don't seem to exist.`)
            } else if (status == "0") {
                if (known) {
                    this.log(`${user} is now offline.`)
                    this.events.stopped(known)
                    this.cache.splice(this.cache.indexOf(known), 1)
                }
            } else if (status == "1") {
                if (!known) {
                    this.log(`${user} is now online.`)
                    const doc = {
                        id: 1337,
                        username: user,
                        url: this.resolveStreamUrl(user),
                        networkId: this.id,
                        source: {},
                        avatar: `https://pomf.tv/img/stream/${user}.png`
                    }

                    this.cache.push(doc)
                    this.events.started(doc)
                }
            } else {
                // no fucking idea what this is
                this.log(`Warn: unexpected status for user ${user}: ${status}`)
            }
        }

        this.events.updated(this.cache)
    }

    /**
     * test the specified user exists and return a response
     * for pomf we just check the online status,
     * it is merely empty for a nonexistent user
     * @param username
     */
    async checkUsernameValidity(username: string): Promise<boolean> {
        const online = await this.checkOnlineStatus(username)
        return online.data !== ""
    }
}