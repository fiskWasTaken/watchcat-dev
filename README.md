# Watchcat

[Click here to invite this bot to your server!](https://discordapp.com/api/oauth2/authorize?client_id=692685101901021234&permissions=2048&scope=bot)

Watchcat is a Discord service designed to handle multiple streaming services.

Messages stay synchronised. If a stream goes offline, it will delete the related announcement. This makes it suitable
for use in a designated stream channel.

## Usage

Usage is fairly straightforward: @mention the bot with a command to manage your configuration. Certain commands are
restricted to the server administrator by default; you may `grant` these commands to one or more roles.

* `use` will use the current channel as the destination for all stream notifications.
* `watch` and `unwatch` will let you specify which streams to notify for. You can enter many usernames at the same time,
  by separating them with a space.
* `status` will return a list of all followed streamers for your server, including their online status.

The bot requires no special permissions -- you just need to make sure it is able to send messages for the channel it is
in.

## Contributing

You'll want TypeScript, ts-node and MongoDB installed. And probably hit `npm install`, too.
