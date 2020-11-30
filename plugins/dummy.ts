import {WatchcatPlugin, Stream} from "./plugin";

/**
 * example client
 */
export class DummyClient extends WatchcatPlugin {
    public dummy: Stream = {
        id: 1,
        networkId: "dummy_client",
        title: "Dummy Stream",
        description: "Dummy Stream",
        follower_count: 1337,
        live_since: "1990",
        adult: true,
        in_multi: true,
        viewers: 1337,
        username: "dummy",
        source: {},
        preview: `https://via.placeholder.com/150`,
        url: this.resolveStreamUrl("dummy")
    }

    constructor() {
        super("DummyClient", "dummy_client")
    }

    cachedStream(streamId: string): Stream {
        return this.dummy;
    }

    live(): Stream[] {
        return [this.dummy];
    }

    match(url: string): string | null {
        const reg = /dummy\.com\/watch\/(.*)$/i;
        const res = url.match(reg);
        return res?.length > 0 ? res[1] : null;
    }

    resolveStreamUrl(username: string): string {
        return `https://dummy.com/watch/${username}`;
    }
}