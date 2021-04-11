import {Storage} from "./model";
import color from "colorts";

function log(message: string) {
    console.log(`[${color("Migrations").red}] ${message}`);
}

/**
 * migrates piczel-oriented database model to generic vendor buckets
 */
export async function migration0001PiczelToGeneric(store: Storage) {
    const channelRenameResult = await store.guilds().collection.updateMany({}, {$rename: {following: "networks.piczel_tv.streams"}});

    if (channelRenameResult.modifiedCount > 0) {
        log(`Migration 'following to networks.piczel_tv.streams': modified: ${channelRenameResult.modifiedCount}`);
    }

    const messageRenameResult = await store.messages().collection.updateMany({piczelUsername: {$exists: true}}, {
        $rename: {"piczelUsername": "streamId"},
        $set: {'networkId': "piczel_tv"}
    });

    if (messageRenameResult.modifiedCount > 0) {
        log(`Migration 'piczelUsername to generic format': modified: ${messageRenameResult.modifiedCount}`);
    }
}

/**
 * run preferred migrations. blocks until migration is complete
 */
export async function runMigrations(store: Storage) {
    await migration0001PiczelToGeneric(store);
}