import {AxiosInstance} from "axios";
import {Stream, WatchcatPlugin} from "./plugin";
import {Storage} from "../model";
import {MasterListPollingPlugin} from "./master-list-polling";

interface PicartoLanguage {
    language_id: number,
    language_code: string
}

export interface PicartoStream {
    id: number,
    channel_name: string,
    channel_title: string,
    channel_viewers: number,
    product: number,
    adult: boolean,
    cat_id: number,
    cat_name: string,
    language: PicartoLanguage,
    is_multistream: boolean,
    gamemode: boolean,
    commissions: boolean,
    thumbnail: string,
    video_thumbnail: string,
    featured: boolean,
    new_account: boolean
}

export class PicartoClient extends MasterListPollingPlugin {
    constructor(private http: AxiosInstance, store: Storage) {
        super("Picarto.tv", "picarto_tv", store)
    }

    resolveStreamUrl(username: string): string {
        return `https://picarto.tv/${username}`
    }

    toStream(stream: PicartoStream): Stream {
        return {
            id: stream.id,
            title: stream.channel_title,
            username: stream.channel_name,
            description: "",
            follower_count: null,
            live_since: "",
            adult: stream.adult,
            in_multi: stream.is_multistream,
            viewers: stream.channel_viewers,
            networkId: "picarto_tv",
            source: stream,
            url: this.resolveStreamUrl(stream.channel_name),
            preview: stream.thumbnail
        }
    }

    async fetch() {
        return this.http({
            method: "post",
            url: "https://picarto.tv/process/explore",
            data: "initial="
        });
    }

    match(url: string): string | null {
        const res = url.match(/picarto\.tv\/(.*)$/i);
        return res?.length > 0 ? res[1] : null;
    }

    async update(): Promise<any> {
        const newContents = (await this.fetch()).data.channels.map(this.toStream)
        this.handlers['updated'](newContents);
        this.compare(this.streams, newContents);
        this.streams = newContents as any;
    }
}