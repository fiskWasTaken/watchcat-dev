import {Stream, WatchcatPlugin} from "./plugin";
import {Storage} from "../model";

/**
 * Master list polling abstract class,
 * for small sites where grabbing a master list of streamers
 * every few minutes is feasible
 */
export abstract class MasterListPollingPlugin extends WatchcatPlugin {
    public streams: Stream[] = [];
    public pollInterval = 30000;

    constructor(name: string, id: string, protected store: Storage) {
        super(name, id)
    }

    live(): Stream[] {
        return this.streams;
    }

    cachedStream(username: string): Stream|null {
        return this.streams.filter((stream: Stream) => {
            return stream.username.toLowerCase() == username.toLowerCase();
        })[0];
    }

    async setup() {
        const contents = await this.store.state().collection.findOne({_id: this.id});
        this.streams = (contents && contents.streams || []) as Stream[];
        this.log(`Resuming from previous state, ${this.streams.length} streams in store.`);
        this.watch();
    }

    watch() {
        this.update();

        setInterval(() => {
            this.update()
        }, this.pollInterval)
    }

    contentsArrayToObject(contents: Stream[]): {[key: number]: Stream} {
        const map = {};

        contents.forEach((content: Stream) => {
            map[content.id] = content;
        });

        return map;
    }

    compare(oldContents, newContents) {
        const previous = this.contentsArrayToObject(oldContents);
        const current = this.contentsArrayToObject(newContents);

        // check added
        for (let key in current) {
            if (!previous[key]) {
                this.handlers["started"](current[key])
            }
        }

        // check removed
        for (let key in previous) {
            if (!current[key]) {
                this.handlers["stopped"](previous[key])
            }
        }
    }

    abstract update()
}