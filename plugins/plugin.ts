// generic streamer interface we expect plugins to conform to
import DateTimeFormat = Intl.DateTimeFormat;

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

export abstract class WatchcatPlugin {
    protected handlers: PluginEvents = {};

    protected constructor(public name, public id) {
        this.handlers.started = (_: Stream) => {
        };
        this.handlers.stopped = (_: Stream) => {
        };
        this.handlers.updated = (_: Stream[]) => {
        };
    }

    /**
     * setup, do we need to set up state?
     */
    async setup() {
    }

    /**
     * teardown, does state need to be saved?
     */
    async teardown() {
    }

    /**
     * test this client to see if it can handle a given url
     */
    abstract match(url: string): string | null

    abstract live(): Stream[];

    abstract cachedStream(streamId: string): Stream;

    /**
     * log plugin message to stdout or whatever
     * @param data
     */
    log(data: string): void {
        console.log(`[${this.name}] ${data}`);
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
     * Return appropriate stream url for this user
     * @param username
     */
    abstract resolveStreamUrl(username: string): string
}

