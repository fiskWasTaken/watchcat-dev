import {AxiosInstance} from "axios";
import {Collection} from "mongodb";

interface PiczelResource {
    url: string;
}

interface PiczelBanner {
    banner: PiczelResource;
}

interface PiczelStreamSettings {
    // todo: add types
    basic: object;
    recording: object;
    private: object;
    emails: object;
}

interface PiczelTag {
    title: string;
    count: number;
}

interface PiczelUser {
    id: number;
    username: string;
    premium?: boolean;
    avatar: PiczelResource;
}

export interface PiczelStream {
    id: number;
    title: string;
    description: string;
    rendered_description: string;
    follower_count: number;
    live: boolean;
    live_since: string;
    isPrivate?: boolean;
    slug: string;
    offline_image: PiczelResource;
    banner: PiczelBanner;
    banner_link: string|null;
    preview: PiczelResource;
    adult: boolean;
    in_multi: boolean;
    parent_streamer: string;
    settings: PiczelStreamSettings;
    viewers: number;
    username: string;
    tags: PiczelTag[];
    user: PiczelUser;
}

interface PiczelHandlers {
    started?: (stream: PiczelStream) => void;
    stopped?: (stream: PiczelStream) => void;
    updated?: (streams: PiczelStream[]) => void;
}

interface PiczelStreamsRequestParams {
    followedStreams: boolean;
    live_only: boolean;
    sfw: boolean;
}

export class PiczelClient {
    private handlers: PiczelHandlers = {};
    public streams: PiczelStream[] = [];

    constructor(private http: AxiosInstance) {
        this.handlers.started = (_: PiczelStream) => {};
        this.handlers.stopped = (_: PiczelStream) => {};
        this.handlers.updated = (_: PiczelStream[]) => {};
    }

    watch(interval: number = 3600) {
        this.update();

        setInterval(() => {
            this.update()
        }, interval)
    }

    async fetch() {
        return this.http.get("https://piczel.tv/api/streams", {
            params: {
                followedStreams: false,
                live_only: false,
                sfw: false
            },
        });
    }

    cachedStream(username: string): PiczelStream|null {
        return this.streams.filter((stream: PiczelStream) => {
            return stream.username.toLowerCase() == username.toLowerCase();
        })[0];
    }

    async update() {
        const newContents = (await this.fetch()).data;
        this.handlers['updated'](newContents);
        this.compare(this.streams, newContents);
        this.streams = newContents as any;
    }

    contentsArrayToObject(contents: PiczelStream[]): {[key: number]: PiczelStream} {
        const map = {};

        contents.forEach((content: PiczelStream) => {
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

    on(event, func) {
        this.handlers[event] = func;
    }
}