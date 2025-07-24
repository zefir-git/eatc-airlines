# eatc-airlines

A command-line tool and API for retrieving scheduled and historical flight data and generating *Endless
ATC* airline configurations.

## Features

- Fetch scheduled and past flights (up to 7 days, or [1 year with a subscription](https://github.com/zefir-git/eatc-airlines/pull/55)) from [AirNav Radar](https://airnavradar.com).
- Convert flight data into `airlines` configuration for *Endless ATC* custom airspace.
- Analyse traffic flow statistics from flight data.
- Simple, fast, and works offline once data is fetched.
- No API key or authentication necessary.

---

## Installation

### Requirements

- [Node.js and NPM](https://nodejs.org/en/download/) (Latest LTS version recommended).
- A terminal, Command Prompt (cmd.exe), or similar for executing shell commands.

### Install Globally

Use your preferred terminal application to run the following command:

```sh
npm install -g eatc-airlines
```

### Android Installation (via Termux)

1. Install *Termux*, a terminal emulator for Android:
   <p>

   [<img src="https://wsrv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg&h=45" alt="Get it on Google Play" height="45">](https://play.google.com/store/apps/details?id=com.termux)
   [<img src="https://wsrv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/a/a3/Get_it_on_F-Droid_%28material_design%29.svg&h=45" alt="Get it on F-Droid" height="45">](https://f-droid.org/packages/com.termux)
   </p>

2. Install Node.js and NPM:
   ```sh
   pkg install nodejs
   ```
3. Install `eatc-airlines`:
   ```sh
   npm i -g eatc-airlines
   ```

### Updating

To update to the latest version:

```sh
npm install -g eatc-airlines@latest
```

---

## Usage

### Fetching Flight Data

Retrieve scheduled and historical flights (up to 7 days in the past) for a specific airport.

#### Command:

```sh
eatc-airlines fetch <icao> [path]
```

- `<icao>` – **ICAO airport code** (e.g., `EGLL` for Heathrow).
- `[path]` – *(Optional)* **File path** to save the data. Defaults to a unique file in the current directory.

#### Example:

```sh
mkdir EGLL && cd EGLL
eatc-airlines fetch EGLL
```

> [!CAUTION]
> Requests might be blocked by Cloudflare. Please see [#52](https://github.com/zefir-git/eatc-airlines/pull/52).

> [!NOTE]
> The fetched JSON files should not be manually edited unless you know what you are doing.

---

### Generating `airlines` Configuration for *Endless ATC*

Convert fetched flight data into an `airlines` configuration for *Endless ATC*.

#### Command:

```sh
eatc-airlines gen <paths...>
```

- `<paths...>` – **One or more JSON files or directories** containing flight data.

#### Example:

```sh
# Convert all flight data in the current directory
eatc-airlines gen .

# Convert all files in a specific directory
eatc-airlines gen ./EGLL

# Convert specific files
eatc-airlines gen file1.json file2.json
```

---

### Analysing Traffic Flow

Generate basic statistics on traffic flow from fetched flight data.

#### Command:

```sh
eatc-airlines flow <paths...>
```

Uses the same arguments as the `gen` command.

#### Example:

```sh
eatc-airlines flow ./EGLL
```

---

## Contributing

This project is **free and open-source** under
the [GNU General Public License, Version 3](https://www.gnu.org/licenses/gpl-3.0.en.html). Contributions are welcome!

For inquiries or collaboration, contact:

| Matrix | [@zefir:cloudnode.pro](https://matrix.to/#/@zefir:cloudnode.pro) |
|--------|------------------------------------------------------------------|
| E-mail | [eatc+airlines@zefir.pro](mailto:eatc+airlines@zefir.pro)        |

---

This project is not authorised, endorsed, or associated with AirNav Radar or Endless ATC in any way.
