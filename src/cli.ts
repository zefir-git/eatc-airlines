#!/usr/bin/env node
/*
 * Copyright © 2025 Zefir Kirilov.
 *
 * This file is part of eatc-airlines.
 *
 * eatc-airlines is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser
 * General Public License as published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * eatc-airlines is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
 * implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with eatc-airlines.
 * If not, see <https://www.gnu.org/licenses/>.
 */
import path from "node:path";
import url from "node:url";
import fs from "node:fs/promises";
import {Command} from "commander";
import {Flight, Location, Direction} from "./api.js";

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
            flight.time,
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

async function get(icao: string, t: Date): Promise<{list: Flight[], more: boolean, oldest: Date}> {
    const url = new URL(icao, "https://www.airnavradar.com/data/airports/search/");
    url.searchParams.set("key", "mrgapdstic");
    url.searchParams.set("max", (t.getTime() / 1000).toFixed(0));
    const res = await fetch(url);
    if (!res.ok) throw new Error(`$ returned ${res.status} (${res.statusText})`);
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
            if (typeof (flight.arrau ?? flight.arreu ?? flight.arrsu) !== "number") continue;
            const time = new Date((flight.arrau ?? flight.arreu ?? flight.arrsu) as number * 1000);
            if (flight.acr !== null && typeof flight.acr !== "string") continue;
            const tail = flight.acr;
            if (typeof flight.act !== "string" || flight.act === "GRND") continue;
            const type = flight.act;
            if ((flight.alic ?? flight.csalic ?? null) !== null && typeof (flight.alic ?? flight.csalic) !== "string") continue;
            const airline = (flight.alic ?? flight.csalic) as string | null;
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

program.command("fetch")
    .description("Fetch arriving flights from airnavradar.com API.")
    .argument("<icao>", "ICAO code of the airport.")
    .argument("[path]", "Path where the retrieved data will be saved in JSON format. Use a dash ('-') to write to standard output.")
    .option("-c, --concurrency <count>", "Number of requests to send in parallel.", "5")
    .action(async (a, b, options) => {
        const icao: string = a;
        let location: string = b ?? icao + "-" + (Date.now()/1000).toFixed(0) + ".json";
        const concurrency = Number.parseInt(options.concurrency);
        if (Number.isNaN(concurrency) || !Number.isFinite(concurrency))
            program.error("concurrency must be valid integer");

        const flights = new Map<number, Flight>();

        const initial = await get(icao, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
        for (const flight of initial.list)
            flights.set(flight.id, flight);
        let more = initial.more;
        let t = new Date(initial.oldest.getTime() + 27e5);
        while (more) {
            const promises: ReturnType<typeof get>[] = [];
            for (let i = 0; i < concurrency; ++i) {
                promises.push(get(icao, new Date(t)));
                t = new Date(t.getTime() - 27e5);
            }
            const results = await Promise.all(promises);
            for (const result of results)
                for (const flight of result.list)
                    flights.set(flight.id, flight);
            more = results.every(r => r.more);
        }
        const json = JSON.stringify(Array.from(flights.values()));
        if (location === "-") process.stdout.write(json);
        else {
            process.stdout.write(`Fetched ${flights.size} flights.\nWriting to ${location}…`);
            await fs.writeFile(location, json);
            process.stdout.write(`\rWritten to ${location}`);
        }
    });

program.command("gen")
    .description("Generate airlines configuration.")
    .argument("<paths...>", "Paths to JSON files or directories containing JSON files. Use a dash ('-') to read from standard input.")
    .action(async (p) => {
        const flights = new Map<number, Flight>();
        const paths = new Set<string>(p);

        // load flights
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
                        flight.time,
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

        // remove invalid flights or try to fill data
        const helicopters = new Set<string>(JSON.parse(await fs.readFile(path.join(PATH, "..", "data", "helicopters.json"), "utf-8")));
        for (const [id, flight] of flights) {
            if (
                helicopters.has(flight.type.toUpperCase())
                || (flight.airline === null && flight.callsign === null)
                || (flight.airline === null && flight.tail === null)
            ) {
                flights.delete(id);
                continue;
            }

            if (flight.callsign !== null && flight.airline === null) {
                // Regional registrations
                if (flight.tail !== null) {
                    /**
                     * Regular expressions for areas with odd registration formats
                     * [expression, number of characters that are part of area code]
                     */
                    const regexes: [RegExp, number][] = [
                        [/^N\d{1,5}[A-Z]{0,2}$/, 1], // US (N)
                        [/^HI\d{3}([A-Z]{2}|\d)?$/, 2], // DO (HI)
                        [/^JA(\d{4}|\d{3}[A-Z]|\d{2}[A-Z]{2})$/, 2], // JP (JA)
                        [/^HL\d{4}$/, 2], // KR (HL)
                        [/^UR\d{5}$/, 2], // UA (UR)
                        [/^UK\d{5}$/, 2], // UZ (UK)
                        [/^YV\d{3}(\d|T|E)$/, 2], // VE (YV)
                        [/^C-[FGI][A-Z]{3}$/, 3], // CA (C-F, C-G, C-I)
                        [/^7T-([VW])[A-Z]{2}$/, 4], // Algeria Civilian (7T-V 7T-W)
                        [/^V[PQ]-B[A-Z]{2}$/, 4], // Bermuda (VP-B VQ-B)
                        [/^VP-L[A-Z]{2}$/, 4], // British Virgin Islands (VP-L)
                        [/^V[PQ]-C[A-Z]{2}$/, 4], // Cayman Islands (VP-C VQ-C)
                        [/^CU-[ACHNTU]1\d{4}$/, 5], // Cuba (CU-A1 CU-C1 CU-H1 CU-N1 CU-T1 CU-U1)
                    ];
                    const match = regexes.find(([regex]) => regex.test(flight.callsign!)) ?? null;
                    if (match !== null) {
                        flights.set(id, new Flight(
                            flight.id,
                            flight.time,
                            flight.tail,
                            flight.type,
                            tailToCallsign(flight.tail.slice(0, match[1]).replaceAll("-", ""), flight.tail.slice(match[1])),
                            flight.callsign,
                            new Location(flight.to.name, flight.to.lat, flight.to.lon),
                            new Location(flight.from.name, flight.from.lat, flight.from.lon),
                        ));
                        continue;
                    }

                    // Registrations with a dash (e.g. AB-123CD)
                    if (flight.tail.replace("-", "").toUpperCase() === flight.callsign.replace("-", "").toUpperCase()) {
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

                // Assuming airline callsign
                // (if it doesn’t start with 3 letters… ¯\_(ツ)_/¯)
                if (/^[A-Z]{3}\d[A-Z\d]{0,3}$/.test(flight.callsign)) {
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
                const pronunciation = callsigns.get(flight.airline!.toUpperCase()) ?? null;
                if (!flight.airline!.includes("-") && pronunciation === null)
                    process.stderr.write(`WARNING! ${flight.airline}: no pronunciation available\n`);
                merged.push({airline: flight.airline!, type: new Set([flight.type]), direction: new Set([direction]), flights: [flight], score: NaN, pronunciation});
            }
        }

        // calculate score
        const maxFlights = Math.max(...merged.map(m => m.flights.length));
        for (const m of merged)
            m.score = (m.flights.length / maxFlights) * 10;

        process.stdout.write(merged
            // sort by score descending
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

program.parse();
