import {AxiosInstance} from "axios";
import {WatchcatPlugin, Stream, PluginEvents} from "./plugin";
import {Storage} from "../model";
import {MasterListPollingPlugin} from "./master-list-polling";

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

interface PiczelStreamsRequestParams {
    followedStreams: boolean;
    live_only: boolean;
    sfw: boolean;
}

export class PiczelPlugin extends MasterListPollingPlugin {
    constructor(private http: AxiosInstance, store: Storage) {
        super("Piczel.tv", "piczel_tv", store)
    }

    resolveStreamUrl(username: string): string {
        return `https://piczel.tv/watch/${username}`
    }

    toStream(ps: PiczelStream): Stream {
        return {
            id: ps.id,
            title: ps.title,
            username: ps.username,
            description: ps.description,
            follower_count: ps.follower_count,
            live_since: ps.live_since,
            adult: ps.adult,
            in_multi: ps.in_multi,
            viewers: ps.viewers,
            networkId: "piczel_tv",
            source: ps,
            url: this.resolveStreamUrl(ps.username),
            preview: `https://piczel.tv/screenshots/stream_${ps.id}.jpg`,
            avatar: ps.user.avatar.url
        }
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

    async update() {
        const newContents = (await this.fetch()).data.map(stream => this.toStream(stream))
        this.handlers['updated'](newContents);
        this.compare(this.streams, newContents);
        this.streams = newContents as any;
    }

    match(url: string): string|null {
        const res = url.match(/piczel\.tv\/watch\/(.*)$/i);
        return res?.length > 0 ? res[1] : null;
    }
}