import {Stream} from "./plugin";
import TwitchJs, {Api} from 'twitch-js'
import {PollingPlugin} from "./polling";
import fetchUtil from "twitch-js/lib/utils/fetch";

interface TwitchStream {
    id: number,
    userId: number,
    userName: string,
    gameId: number,
    gameName: string,
    type: string,
    title: string,
    viewerCount: number,
    startedAt: string,
    language: string,
    thumbnailUrl: string,
    tagIds: number[],
}

export class TwitchPlugin extends PollingPlugin {
    private api: Api;

    constructor() {
        super("twitch.tv", "twitch_tv")
    }

    setConfig(config: any) {
        this.config = config;

        const onAuthenticationFailure = () =>
            fetchUtil('https://id.twitch.tv/oauth2/token', {
                method: 'post',
                search: {
                    grant_type: 'client_credentials',
                    client_id: this.config?.clientId,
                    client_secret: this.config?.clientSecret,
                },
            }).then(response => response.accessToken)

        this.api = new TwitchJs({
            clientId: this.config?.clientId,
            onAuthenticationFailure: onAuthenticationFailure
        }).api;
    }

    toStream(event: TwitchStream): Stream {
        return {
            id: event.id,
            networkId: this.id,
            source: event,
            url: this.resolveStreamUrl(event.userName),
            username: event.userName,
            viewers: event.viewerCount,
            live_since: event.startedAt,
            preview: event.thumbnailUrl.replace("{width}", "640").replace("{height}", "360"),
            title: event.title
        }
    }

    match(url: string): string | null {
        const res = url.match(/twitch\.tv\/(.*)$/i);
        return res?.length > 0 ? res[1] : null;
    }

    resolveStreamUrl(username: string): string {
        return `https://twitch.tv/${username}`;
    }

    async poll() {
        // step one: concatenate our target users to make requests for
        const collect = await this.globalFollows();

        this.log("Checking users: " + collect.join(", "))

        // todo: if 'collect' is empty this is going to query everyone
        // todo: is currently only going to work with up to 100 users with this model.
        // instead of doing 100 user splits, we should really move to webhooks, but I'm lazy
        const result = await this.api.get(`streams`, {
            search: {
                user_login: collect
            }
        });

        const newContents = result.data.map(stream => this.toStream(stream));
        this.handlers.updated(newContents);
        this.compare(this.cache, newContents);
        this.cache = newContents as any;
    }
}