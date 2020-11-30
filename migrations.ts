import {Storage} from "./model";

/**
 * migrates piczel-oriented database model to generic vendor buckets
 */
export async function migration0001PiczelToGeneric(store: Storage) {
    const channelRenameResult = await store.guilds().collection.updateMany({}, {$rename: {following: "networks.piczel_tv.state"}});
    console.log(`Migration 'following to networks.piczel_tv.streams': matched: ${channelRenameResult.matchedCount}, modified: ${channelRenameResult.modifiedCount}`);
    const messageRenameResult = await store.messages().collection.updateMany({piczelUsername: {$exists: true}}, {
        $rename: {"piczelUsername": "streamId"},
        $set: {'networkId': "piczel_tv"}
    });
    console.log(`Migration 'piczelUsername to generic format': matched: ${messageRenameResult.matchedCount}, modified: ${messageRenameResult.modifiedCount}`);
}

/**
 * run preferred migrations. blocks until migration is complete
 */
export async function runMigrations(store: Storage) {
    await migration0001PiczelToGeneric(store);
}