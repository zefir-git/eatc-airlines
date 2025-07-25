#!/usr/bin/env node
/*
 * Copyright © 2025 Zefir Kirilov.
 *
 * This file is part of eatc-airlines.
 *
 * eatc-airlines is free software: you can redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * eatc-airlines is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
 * implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along with eatc-airlines.
 * If not, see <https://www.gnu.org/licenses/>.
 */
import path from "node:path";
import url from "node:url";
import fs from "node:fs/promises";
import {Command} from "commander";
import {Flight, Location, Direction, PHONETIC, NUMBERS} from "./api.js";

const PATH = path.dirname(url.fileURLToPath(import.meta.url));

const project = JSON.parse(await fs.readFile(path.join(PATH, "..", "package.json"), "utf-8"));
const program = new Command();

async function loadFlightsFromFs(file: string, _currentDepth: number = 0): Promise<Flight[]> {
    const flights: Flight[] = [];
    let stats: import("node:fs").Stats;
    try {
        stats = await fs.stat(file);
    }
    catch (e) {
        return program.error(`${file}: ${e instanceof Error ? e.message : "failed to stat"}`);
    }
    if (stats.isDirectory()) {
        if (_currentDepth > 5) return program.error(`${file}: maximum sub-directory depth reached`);
        for (const dirent of await fs.readdir(file))
            for (const flight of await loadFlightsFromFs(path.join(file, dirent), ++_currentDepth))
                flights.push(flight);
        return flights;
    }
    const contents = await fs.readFile(file, "utf-8");
    let rawFlights: any[];
    try {
        rawFlights = JSON.parse(contents);
    }
    catch (e) {
        return program.error(`${file}: ${e instanceof Error ? e.message : "JSON.parse: failed to parse"}`);
    }
    for (const flight of rawFlights)
        flights.push(new Flight(
            flight.id,
            new Date(flight.time),
            flight.tail,
            flight.type,
            flight.airline,
            flight.callsign,
            new Location(flight.to.name, flight.to.lat, flight.to.lon),
            new Location(flight.from.name, flight.from.lat, flight.from.lon),
        ));
    return flights;
}

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const digits = "1234567890";

function tailToCallsign(prefix: string, sample: string): string {
    const countryPart = prefix.toUpperCase();
    const localPart = sample.toUpperCase();
    const indices: {letter: number, number: number} = {letter: 0, number: 0};
    const localPartFormat = localPart.split("").map(char => {
        if (/^\d$/.test(char))
            return digits[(indices.number++) % digits.length];
        else if (/^[A-Z]$/.test(char))
            return alphabet[(indices.letter++) % alphabet.length];
        return char;
    }).join("");
    return `${countryPart}-${localPartFormat}`;
}

program
    .name(project.name)
    .description(project.description.replace(/(.{1,80})(?=\s|$)/g, "$1\n").replace(/\n\s+/g, "\n"))
    .version(project.version, "-v, --version", "Output the version number.")
    .helpOption("-h, --help", "Display help for command.")
    .helpCommand("help [command]", "Display help for command.");

async function get(icao: string, t: Date, ua?: string, cf?: string, session?: string): Promise<{list: Flight[], more: boolean, oldest: Date}> {
    const url = new URL(icao, "https://www.airnavradar.com/data/airports/search/");
    url.searchParams.set("key", "mrgapdstic");
    url.searchParams.set("max", (t.getTime() / 1000).toFixed(0));

    const requestHeaders = new Headers();
    if (ua !== undefined)
        requestHeaders.set("User-Agent", ua);
    if (cf !== undefined)
        requestHeaders.append("Cookie", "cf_clearance=" + cf);
    if (session !== undefined)
        requestHeaders.append("Cookie", "rb_session=" + session);

    const res = await fetch(url, {
        method: "GET",
        headers: requestHeaders,
        credentials: "include",
    });
    if (!res.ok) {
        if (
            res.status === 403
            && res.headers.get("content-type") !== "application/json"
        )
            console.warn("\r\n\x1b[0;33mYou are likely facing a Cloudflare challenge. Please see \x1b[1;33m\x1b]8;;https://github.com/zefir-git/eatc-airlines/pull/52#issue-3145483139\x1b\\#52\x1b]8;;\x1b\\\x1b[0;33m on how to resolve it.\x1b[0m");
        console.error(new Error(`API returned ${res.status} (${res.statusText}) for ${url}`));
        process.exit(1);
    }
    const body = await res.text();
    try {
        const json: {list: Record<string, string | number | boolean | null>[], hasEarlier: boolean} = JSON.parse(body);
        const more = json.hasEarlier;
        let oldest: Date = t;
        const flights: Flight[] = [];
        for (const flight of json.list) {
            if (typeof flight.fid !== "number") continue;
            const id = flight.fid;
            // actual, estimated, scheduled
            if (typeof (flight.arrau ?? flight.arreu ?? flight.arrsu ?? flight.arrsts) !== "number") continue;
            const time = new Date((flight.arrau ?? flight.arreu ?? flight.arrsu ?? flight.arrsts) as number * 1000);
            if (flight.acr !== null && typeof flight.acr !== "string") continue;
            const tail = flight.acr;
            if (typeof flight.act !== "string" || flight.act === "GRND" || flight.act.toLowerCase() === "zzzz") continue;
            const type = flight.act;
            if (
                ((flight.csalic === undefined ? flight.alic : flight.csalic) ?? null) !== null
                && typeof (flight.csalic === undefined ? flight.alic : flight.csalic) !== "string"
            ) continue;
            const airline = ((flight.csalic === undefined ? flight.alic : flight.csalic) ?? null) as string | null;
            if ((flight.cs ?? flight.fnic ?? flight.ectlcs) !== null && typeof (flight.cs ?? flight.fnic ?? flight.ectlcs) !== "string") continue;
            const callsign = (flight.cs ?? flight.fnic ?? flight.ectlcs) as string | null;
            if (typeof flight.apdstic !== "string" || typeof flight.apdstla !== "number" || typeof flight.apdstlo !== "number") continue;
            const to = new Location(flight.apdstic, flight.apdstla, flight.apdstlo);
            if (typeof flight.aporgic !== "string" || typeof flight.aporgla !== "number" || typeof flight.aporglo !== "number") continue;
            const from = new Location(flight.aporgic, flight.aporgla, flight.aporglo);
            if (to.name === from.name) continue;
            flights.push(new Flight(id, time, tail, type, airline, callsign, to, from));
            if (time < oldest) oldest = time;
        }
        return {list: flights, more, oldest};
    }
    catch (e) {
        return program.error(`${icao}: ${e instanceof Error ? e.message : "failed to parse"}`);
    }
}

function timeAgo(date: Date) {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    return `${Math.floor(diff / 3600) > 0 ? Math.floor(diff / 3600) + ":" : ""}${Math.floor(diff / 60)}:${(diff % 60).toString().padStart(2, "0")}`;
}

async function loadFlights(paths: Set<string>) {
    const flights = new Map<number, Flight>();
    for (const path of paths) {
        if (path === "-") {
            const chunks: Uint8Array[] = [];
            process.stdin.on("data", chunk => chunks.push(chunk));
            await Promise.race([
                new Promise<void>(resolve => process.stdin.once("end", () => resolve())),
                new Promise<void>(resolve => process.stdin.once("close", () => resolve())),
            ]);
            const contents = Buffer.concat(chunks).toString("utf-8");
            let rawFlights: any[];
            try {
                rawFlights = JSON.parse(contents);
            }
            catch (e) {
                return program.error("stdin: " + (e instanceof Error ? e.message : "JSON.parse: failed to parse"));
            }
            for (const flight of rawFlights)
                flights.set(flight.id, new Flight(
                    flight.id,
                    new Date(flight.time),
                    flight.tail,
                    flight.type,
                    flight.airline,
                    flight.callsign,
                    new Location(flight.to.name, flight.to.lat, flight.to.lon),
                    new Location(flight.from.name, flight.from.lat, flight.from.lon),
                ))
            continue;
        }

        for (const flight of await loadFlightsFromFs(path))
            flights.set(flight.id, flight);
    }
    return flights;
}


const accent = `\x1b[38;2;${[0, 188, 125].join(";")}m`;
const bold = "\x1b[1m";
const dim = "\x1b[38;5;250m";
const reset = "\x1b[0m";

function bar(label: string, value: any, percent: number, colour = accent) {
    const char = "▇";
    const bars = 50;
    let bar = "";
    if (percent === 0)
        bar = "";
    else if (percent < 0.02)
        bar = "▏";
    else bar = char.repeat(Math.round(bars * percent));
    process.stdout.write(`${label}${dim}:${reset} ${colour}${bar}${reset} ${value}\n`);
}

program.command("fetch")
       .description("Fetch arriving flights from airnavradar.com API.")
       .argument("<icao>", "ICAO code of the airport.")
       .argument("[path]", "Path where the retrieved data will be saved in JSON format. Use a dash ('-') to write to standard output.")
       .option("-c, --concurrency <count>", "Number of requests to send in parallel.", "5")
       .option("-s, --silent", "Silent mode (no progress indicator).")
       .option("-u, --user-agent <name>", "User agent string to send to the API.")
       .option("-C, --cloudflare <cookie>", "Cloudflare clearance cookie to send to the API.")
       .option("-S, --session <cookie>", "AirNav Radar session cookie for extended flights history.")
       .action(async (a, b, options) => {
           const icao: string = a;
           let location: string = b ?? icao + "-" + (Date.now() / 1000).toFixed(0) + ".json";
           const concurrency = Number.parseInt(options.concurrency);
           if (Number.isNaN(concurrency) || !Number.isFinite(concurrency))
               program.error("concurrency must be valid integer");

           if (options.silent !== true) process.stderr.write(`Fetching flights for ${icao}…\n`);

           const started = new Date();

           function progress(flights: Map<number, Flight>, started: Date) {
               if (options.silent) return;

               const week = new Date(started.getTime() - 7 * 24 * 60 * 60 * 1000);

               const allFlights = Array.from(flights.values());
               const older = allFlights.slice(-concurrency * 30);
               const oldest = older.length > 0 ? older.reduce((f, g) => f.time.getTime() < g.time.getTime() ? f : g).time : null;

               let message: string;
               if (oldest !== null && oldest.getTime() < week.getTime()) {
                   message = `\r[${timeAgo(started)}] Fetched: ${flights.size}. Oldest flight: ${oldest.toLocaleDateString(void 0, {
                       day: "numeric",
                       weekday: "short",
                       month: "short",
                       year: "numeric",
                   })} \x1b[2mEstimation of remaining flights not possible.\x1b[0m`;
               }
               else {
                   const thisWeek = allFlights.filter(f => f.time.getTime() >= week.getTime());
                   const averagePerDay = thisWeek.length / new Set(thisWeek.map(f => f.time.toDateString())).size;
                   const remainingDays = ((oldest?.getTime() ?? week.getTime()) - week.getTime()) / (24 * 60 * 60 * 1000);
                   const estimated = Math.round(averagePerDay * remainingDays);
                   message = `\r[${timeAgo(started)}] Fetched: ${flights.size} of ${Number.isNaN(estimated) ? "N/A" : (flights.size + estimated)} (estimated).${oldest !== null ? ` Oldest flight: ${oldest.toLocaleDateString( void 0, {day: "numeric", weekday: "short", month: "short", year: "numeric"})}` : ""}`;
               }
               process.stderr.write(message + " ".repeat(Math.max(0, process.stdout.columns - message.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").length)));
           }

           const flights = new Map<number, Flight>();
           progress(flights, started);
           const progressInterval = setInterval(() => progress(flights, started), 1000);

           const initial = await get(icao, new Date(Date.now() + 24 * 60 * 60 * 1000), options.userAgent, options.cloudflare, options.session);
           for (const flight of initial.list)
               flights.set(flight.id, flight);
           progress(flights, started);
           let more = initial.more;
           let t = new Date(initial.oldest.getTime() + 27e5);

           process.once("SIGINT", async () => {
               clearInterval(progressInterval);
               if (options.silent !== true) process.stderr.write("\n");
               if (location !== "-")
                   process.stdout.write(`SIGINT received, saving ${flights.size} fetched flight${flights.size === 1 ? "" : "s"} to ${location}…`);
               await finalSave();
               process.exit(0);
           });



           async function finalSave() {
               const json = JSON.stringify(Array.from(flights.values()));
               if (location === "-") process.stdout.write(json);
               else {
                   await fs.writeFile(location, json);
                   process.stdout.write(`\r\nWritten to ${location}.\n`);
               }
           }

           while (more) {
               const promises: ReturnType<typeof get>[] = [];
               for (let i = 0; i < concurrency; ++i) {
                   promises.push(get(icao, new Date(t), options.userAgent, options.cloudflare, options.session));
                   t = new Date(t.getTime() - 27e5);
               }
               const results = await Promise.allSettled(promises);
               let error: Error | null = null;
               for (const result of results) {
                   if (result.status === "rejected") {
                       error = result.reason;
                       break;
                   }
                   for (const flight of result.value.list)
                       flights.set(flight.id, flight);
               }
               if (error !== null) {
                   clearInterval(progressInterval);
                   if (options.silent !== true) process.stderr.write("\n");
                   console.log(error);
                   if (location !== "-") {
                       process.stdout.write(`Saving ${flights.size} fetched flight${flights.size === 1 ? "" : "s"} to ${location}…`);
                   }
                   await finalSave();
                   return;
               }
               more = results.filter(r => r.status === "fulfilled").every(r => r.value.more);
               progress(flights, started);

               if (location !== "-")
                   await fs.writeFile(location, JSON.stringify(Array.from(flights.values())));
           }

           clearInterval(progressInterval);
           if (options.silent !== true) process.stderr.write("\n");
           process.stdout.write(`Fetched ${flights.size} flight${flights.size === 1 ? "" : "s"}.\nWriting to ${location}…`);
           await finalSave();
       });

program.command("gen")
       .description("Generate airlines configuration.")
       .argument("<paths...>", "Paths to JSON files or directories containing JSON files. Use a dash ('-') to read from standard input.")
       .action(async (p) => {
           const paths = new Set<string>(p);
           const flights = await loadFlights(paths);

           // remove invalid flights or try to fill data
           const helicopters = new Set<string>(JSON.parse(await fs.readFile(path.join(PATH, "..", "data", "helicopters.json"), "utf-8")));
           const prefixes: string[] = JSON.parse(await fs.readFile(path.join(PATH, "..", "data", "prefixes.json"), "utf-8"));
           for (const [id, flight] of flights) {
               if (
                   helicopters.has(flight.type.toUpperCase())
                   || (flight.airline === null && flight.callsign === null)
                   || (flight.airline === null && flight.tail === null)
               ) {
                   flights.delete(id);
                   continue;
               }


               // Regional registrations
               if (flight.tail !== null && flight.callsign !== null) {
                   // Registrations with a dash (e.g. AB-123CD)
                   if (flight.tail.replace("-", "").toUpperCase() === flight.callsign.replace("-", "").toUpperCase()) {
                       // if there is no dash…
                       if (!flight.tail.includes("-")) {
                           const prefix = prefixes.find(p => flight.tail?.toUpperCase().startsWith(p));
                           if (prefix === undefined) {
                               flights.delete(id);
                               continue;
                           }
                           flights.set(id, new Flight(
                               flight.id,
                               flight.time,
                               flight.tail,
                               flight.type,
                               tailToCallsign(prefix, flight.tail.toUpperCase().slice(prefix.length)),
                               flight.callsign,
                               new Location(flight.to.name, flight.to.lat, flight.to.lon),
                               new Location(flight.from.name, flight.from.lat, flight.from.lon),
                           ));
                           continue;
                       }
                       flights.set(id, new Flight(
                           flight.id,
                           flight.time,
                           flight.tail,
                           flight.type,
                           tailToCallsign(flight.tail.slice(0, flight.tail.indexOf("-")), flight.tail.slice(flight.tail.indexOf("-") + 1)),
                           flight.callsign,
                           new Location(flight.to.name, flight.to.lat, flight.to.lon),
                           new Location(flight.from.name, flight.from.lat, flight.from.lon),
                       ));
                       continue;
                   }
               }

               if (flight.callsign !== null && (flight.airline === "{PVT}" || flight.airline === null)) {
                   // Assuming airline callsign
                   // (if it doesn’t start with 3 letters… ¯\_(ツ)_/¯)
                   if (!/^[A-Z]{3}\d[A-Z\d]{0,3}$/.test(flight.callsign)) {
                       flights.delete(id);
                       continue;
                   }

                   flights.set(id, new Flight(
                       flight.id,
                       flight.time,
                       flight.tail,
                       flight.type,
                       flight.callsign.slice(0, 3),
                       flight.callsign,
                       new Location(flight.to.name, flight.to.lat, flight.to.lon),
                       new Location(flight.from.name, flight.from.lat, flight.from.lon),
                   ));
               }

               // if there is an airline and the callsign starts with more than 3 letters
               else if (flight.callsign !== null && /^[A-Z]{4,}/.test(flight.callsign.toUpperCase())) {
                   flights.set(id, new Flight(
                       flight.id,
                       flight.time,
                       flight.tail,
                       flight.type,
                       flight.callsign.toUpperCase().replace(/[^A-Z\d]/g, "") + "-",
                       flight.callsign,
                       flight.to,
                       flight.from,
                   ));
               }
           }

           const merged: {
               airline: string,
               type: Set<string>,
               direction: Set<Direction>,
               flights: Flight[],
               /**
                * 0–10 based on number of flights
                */
               score: number,
               pronunciation: string | null
           }[] = [];

           // group together flights that are from same airline, type and direction
           const callsigns = new Map<string, string>(Object.entries(JSON.parse(await fs.readFile(path.join(PATH, "..", "data", "callsigns.json"), "utf-8"))));
           for (const flight of flights.values()) {
               if (flight.airline === undefined) continue;
               const direction = flight.to.direction(flight.from)!;
               const existing = merged.find(m => m.airline === flight.airline && m.type.has(flight.type) && m.direction.has(direction));
               if (existing !== undefined) {
                   existing.flights.push(flight);
                   existing.type.add(flight.type);
                   existing.direction.add(direction);
               }
               else {
                   let pronunciation: string | null;
                   if (flight.airline !== null && flight.airline.endsWith("-")) {
                       pronunciation = flight.airline.slice(0, -1);
                       for (const [number, value] of Object.entries(NUMBERS))
                           pronunciation = pronunciation.replaceAll(number, ` ${value} `);
                       pronunciation = pronunciation.trim().replace(/\s+/g, " ").toLowerCase();
                   }
                   else if (flight.airline === null || flight.airline.includes("-"))
                       pronunciation = null;
                   else
                       pronunciation = callsigns.get(flight.airline.toUpperCase())
                           ?? flight.airline.toUpperCase().split("")
                               .map(c => PHONETIC[c as keyof typeof PHONETIC] ?? c).join(" ");
                   merged.push({
                       airline: flight.airline!,
                       type: new Set([flight.type]),
                       direction: new Set([direction]),
                       flights: [flight],
                       score: NaN,
                       pronunciation
                   });
               }
           }

           // calculate score
           const maxFlights = Math.max(...merged.map(m => m.flights.length));
           for (const m of merged) {
               m.score = Math.round((m.flights.length / maxFlights) * 1000) / 100;
               if (
                   m.pronunciation !== null
                   && m.score > 0 && m.score <= 0.005
                   && !m.airline?.endsWith("-")
                   && !Array.from(callsigns.values()).includes(m.pronunciation)
               )
                   process.stderr.write(`WARNING! ${m.airline}: no pronunciation available\n`);
           }

           process.stdout.write(merged
                   .filter(m => m.score >= 0.005)
                   .sort((a, b) => a.airline.localeCompare(b.airline))
                   .sort((a, b) => b.score - a.score)
                   .map(entry => {
                       return "\t" +
                           entry.airline + ", " +
                           entry.score.toFixed(2) + ", " +
                           Array.from(entry.type).sort((a, b) => a.localeCompare(b)).join("/").toLowerCase() + ", " +
                           (entry.pronunciation === null ? "0" : entry.pronunciation) + ", " +
                           Array.from(entry.direction).sort((a, b) => a.name.localeCompare(b.name)).join("").toLowerCase()
                   }).join("\n")
               + "\n"
           )
       });

program.command("flow")
       .description("Calculate the flow of arrivals of an airport.")
       .argument("<paths...>", "Paths to JSON files or directories containing JSON files. Use a dash ('-') to read from standard input.")
       .action(async (p) => {
           const paths = new Set<string>(p);
           const flights = await loadFlights(paths);

           const stats: Record<string, Record<number, number>> = {};

           const helicopters = new Set<string>(JSON.parse(await fs.readFile(path.join(PATH, "..", "data", "helicopters.json"), "utf-8")));
           for (const flight of flights.values()) {
               if (
                   typeof flight.type !== "string"
                   || !(flight.time instanceof Date)
                   || Number.isNaN(flight.time.getTime())
                   || helicopters.has(flight.type.toUpperCase())
               ) {
                   flights.delete(flight.id);
                   continue;
               }

               const day = flight.time.toISOString().split("T")[0]!;
               const hour = flight.time.getUTCHours();
               if (stats[day] === undefined) stats[day] = {};
               if (stats[day]![hour] === undefined) stats[day]![hour] = 0;
               ++stats[day]![hour];
           }

           if (flights.size === 0)
               program.error("No flights were loaded.");

           const sorted: Flight[] = Array.from(flights.values()).sort((a, b) => b.time.getTime() - a.time.getTime());
           const oldest = sorted.slice(-1)[0]!.time;
           oldest.setUTCHours(0, 0, 0, 0);
           const earliest = sorted[0]!.time;
           earliest.setUTCHours(0, 0, 0, 0);

           process.stdout.write(`${dim}#${reset} ${bold}Hourly Flow${reset} ${dim}(${oldest.toLocaleDateString()}${
               oldest.getTime() === earliest.getTime()
               ? ""
               : (" to " + earliest.toLocaleDateString())
           })${reset}\n\n`);

           const avgHourlyFlowOverall = Object
                   .values(stats)
                   .flatMap(day => Object.values(day))
                   .reduce((sum, count) => sum + count, 0)
               / Object
                   .values(stats)
                   .flatMap(day => Object.values(day))
                   .length;

           const peakHourlyFlow = Math.max(...Object.values(stats).flatMap(day => Object.values(day)));
           const lowestHourlyFlow = Math.min(...Object.values(stats).flatMap(day => Object.values(day)));

           process.stdout.write(`\taverage\t${dim}=${reset} ${avgHourlyFlowOverall.toFixed(2)}\n`);
           process.stdout.write(`\thighest\t${dim}=${reset} ${peakHourlyFlow}\n`);
           process.stdout.write(`\tlowest\t${dim}=${reset} ${lowestHourlyFlow}\n`);

           process.stdout.write(`\n\n${dim}#${reset} ${bold}Hourly Average per Weekday${reset}\n\n`);
           const weekDays = new Map<string, [number, number, number]>();
           let weekDayMax = 0;
           for (const [day, hours] of Object.entries(stats)) {
               const key = new Date(day).toLocaleDateString(void 0, {weekday: "short"});
               if (!weekDays.has(key)) weekDays.set(key, [0, 0, new Date(day).getUTCDay()]);
               weekDays.get(key)![0] += Object.values(hours).reduce((sum, count) => sum + count, 0);
               weekDays.get(key)![1] += Object.values(hours).length;
               weekDayMax = Math.max(weekDayMax, weekDays.get(key)![0]);
           }

           for (const [day, [flights, count]] of Array.from(weekDays.entries()).sort((a, b) =>(a[1][2] && !b[1][2]) ? -1 : (!a[1][2] && b[1][2]) ? 1 : a[1][2] - b[1][2]))
               bar(day, (flights / count).toFixed(2), flights / weekDayMax);

           process.stdout.write(`\n\n${dim}#${reset} ${bold}Average per Hour${reset}\n\n`);
           const hourlyAverage = Array.from({length: 24}, (_, hour) =>
               Object.values(stats)
                     .map(dayStats => dayStats[hour] ?? 0)
                     .reduce((sum, count) => sum + count, 0)
               / Object.values(stats).length
           );
           const hourlyAverageMax = Math.max(...hourlyAverage);
           for (const [hour, flights] of hourlyAverage.entries())
               bar(hour.toString().padStart(2, "0") + ":00Z", flights.toFixed(2), flights / hourlyAverageMax);
       });

program.parse();
