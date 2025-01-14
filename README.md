# eatc-airlines

A command-line tool and API for retrieving air traffic data and generating airline configurations for EndlessATC custom
airspaces.

## Installation

To use this tool, you must have [Node.js and NPM installed](https://nodejs.org/en/download/).

Install globally using the following command:

```sh
npm install -g eatc-airlines
```

## Usage

Once installed, you can use the tool with the following command:

```sh
eatc-airlines [options] [command]
```

For detailed help, run `eatc-airlines help`.

## Commands

### `fetch`

Fetch flight data for an airport using [AirNav Radar](https://airnavradar.com). This command retrieves flights up to
approximately 7 days in the past.

**Example:**

```sh
eatc-airlines fetch EGLL lhr.json
```

### `gen`

After fetching flight data, use this command to generate an `airlines` configuration for your airports in an EndlessATC
custom airspace.

**Example:**

```sh
eatc-airlines gen lhr.json /path/to/output.json ../directory/
```

You can specify multiple files and directories as inputs.

Alternatively, you can manually copy the command’s standard output into your custom airspace file.

If you encounter warnings about missing airline callsigns in the standard error output, please consider opening a pull
request or reporting an issue, if appropriate.

## Contributing

This software is free and open-source, licensed under the terms of
the [GNU General Public License, Version 3](https://www.gnu.org/licenses/gpl-3.0.en.html). Contributions are most
welcome.

For coordination or inquiries, please get in touch via the following channels:

| Matrix | [@zefir:cloudnode.pro](https://matrix.to/#/@zefir:cloudnode.pro) |
|--------|------------------------------------------------------------------|
| E-mail | [eatc+airlines@zefir.pro](mailto:eatc+airlines@zefir.pro)        |
