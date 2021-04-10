import {Stream} from "./handler";
import {PollingHandler} from "./polling";
import {Command} from "../commands";

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

export default class PicartoHandler extends PollingHandler {
    constructor(config: { [key: string]: any }) {
        super(config,"Picarto.tv", "picarto_tv")
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
            networkId: this.id,
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

    async poll(): Promise<any> {
        const newContents = (await this.fetch()).data.channels.map(stream => this.toStream(stream))
        this.events.updated(newContents);
        this.compare(this.cache, newContents);
        this.cache = newContents as any;
    }
}