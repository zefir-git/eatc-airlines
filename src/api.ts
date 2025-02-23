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
export class LatLon {
    /**
     * Latitude in decimal degrees
     */
    public readonly lat: number;

    /**
     * Longitude in decimal degrees
     */
    public readonly lon: number;

    /**
     * @param lat Latitude in decimal degrees
     * @param lon Longitude in decimal degrees
     */
    public constructor(
        lat: number,
        lon: number
    ) {
        this.lat = lat;
        this.lon = lon;
    }

    /**
     * Calculate initial bearing to another {@link LatLon}
     * @param to
     * @returns Bearing in decimal degrees
     */
    public bearing(to: LatLon): number {
        const φ1 = this.lat * Math.PI / 180;
        const φ2 = to.lat * Math.PI / 180;
        const λ1 = this.lon * Math.PI / 180;
        const λ2 = to.lon * Math.PI / 180;

        const Δλ = λ2 - λ1;

        const y = Math.sin(Δλ) * Math.cos(φ2);
        const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

        const θ = Math.atan2(y, x);

        return (θ * 180 / Math.PI + 360) % 360;
    }

    /**
     * Calculate initial direction to another {@link LatLon}
     * @param to
     */
    public direction(to: LatLon): Direction {
        return Direction.fromBearing(this.bearing(to));
    }

    public toString() {
        return `${this.lat >= 0 ? Direction.N : Direction.S}, ${this.lon >= 0 ? Direction.E : Direction.W}`;
    }

    public toJSON() {
        return {
            lat: this.lat,
            lon: this.lon,
        };
    }
}

export class Location extends LatLon {
    /**
     * The name of this location
     */
    public readonly name: string;

    /**
     * @param name The name of this location
     * @param lat Latitude in decimal degrees
     * @param lon Longitude in decimal degrees
     */
    public constructor(
        name: string,
        lat: number,
        lon: number
    ) {
        super(lat, lon);
        this.name = name;
    }

    public override toString(): string {
        return this.name + ", " + super.toString();
    }

    public override toJSON() {
        return {
            name: this.name,
            lat: this.lat,
            lon: this.lon,
        };
    }
}

export class Direction {
    /**
     * North
     */
    public static N = new Direction("N");
    /**
     * East
     */
    public static E = new Direction("E");
    /**
     * South
     */
    public static S = new Direction("S");
    /**
     * West
     */
    public static W = new Direction("W");

    private constructor(public readonly name: string) {
    }

    /**
     * Get direction from bearing
     * @param bearing Bearing in decimal degrees
     */
    public static fromBearing(bearing: number): Direction {
        const normalisedBearing = (bearing + 360) % 360;
        if (normalisedBearing >= 225 && normalisedBearing < 315) return Direction.W;
        if (normalisedBearing >= 135 && normalisedBearing < 225) return Direction.S;
        if (normalisedBearing >= 45 && normalisedBearing < 135) return Direction.E;
        return Direction.N;
    }

    public toString(): string {
        return this.name;
    }

    public toJSON(): string {
        return this.name;
    }
}

export class Flight {
    /**
     * Unique ID
     */
    public readonly id: number;

    /**
     * Flight arrival time (or estimate)
     */
    public readonly time: Date;

    /**
     * Tail number (aircraft registration)
     */
    public readonly tail: string | null;

    /**
     * Aircraft ICAO type designator
     */
    public readonly type: string;

    /**
     * Airline ICAO code (unique 3-letter identifier)
     */
    public readonly airline: string | null;

    /**
     * Flight callsign
     */
    public readonly callsign: string | null;

    /**
     * Flight destination
     */
    public readonly to: Location;

    /**
     * Flight origin
     */
    public readonly from: Location;

    /**
     * @param id Unique ID
     * @param time Flight arrival time (or estimate)
     * @param tail Tail number (aircraft registration)
     * @param type Aircraft ICAO type designator
     * @param airline Airline ICAO code (unique 3-letter identifier)
     * @param callsign Flight callsign
     * @param to Flight destination
     * @param from Flight origin
     */
    public constructor(
        id: number,
        time: Date,
        tail: string | null,
        type: string,
        airline: string | null,
        callsign: string | null,
        to: Location,
        from: Location
    ) {
        this.id = id;
        this.time = time;
        this.tail = tail;
        this.type = type;
        this.airline = airline;
        this.callsign = callsign;
        this.to = to;
        this.from = from;
    }

    public toJSON() {
        return {
            id: this.id,
            time: this.time?.getTime() ?? null,
            tail: this.tail,
            type: this.type,
            airline: this.airline,
            callsign: this.callsign,
            to: this.to,
            from: this.from,
        };
    }
}

export const PHONETIC = {
    A: "Alpha",
    B: "Bravo",
    C: "Charlie",
    D: "Delta",
    E: "Echo",
    F: "Foxtrot",
    G: "Golf",
    H: "Hotel",
    I: "India",
    J: "Juliet",
    K: "Kilo",
    L: "Lima",
    M: "Mike",
    N: "November",
    O: "Oscar",
    P: "Papa",
    Q: "Quebec",
    R: "Romeo",
    S: "Sierra",
    T: "Tango",
    U: "Uniform",
    V: "Victor",
    W: "Whisky",
    X: "X-Ray",
    Y: "Yankee",
    Z: "Zulu",
} as const;
