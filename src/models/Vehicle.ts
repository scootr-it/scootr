import Boom from "@hapi/boom";
import Joi from "joi";
import { ILocation } from "../common/ILocation";
import { Config } from "../config/Config";
import { Schema } from "../config/Schema";
import Database from "../utilities/Database";
import { Utilities } from "../utilities/Utilities";

interface IDatabaseVehicle
{
    id: string,
    battery_level: number,
    location: string,
    available: boolean,
}

interface ICreateVehicle
{
    battery_level: number,
    location: ILocation,
}

interface IUpdateVehicle
{
    battery_level?: number,
    location?: ILocation,
}

export interface ISerializedVehicle
{
    id: string,
    battery_level: number,
    location: ILocation,
    available: boolean,
}

export class Vehicle
{
    private constructor
    (
        public readonly id: string,
        private _battery_level: number,
        private _location: ILocation,
        public readonly available: boolean,
    )
    {}

    public get battery_level(): number
    {
        return this._battery_level;
    }

    public get location(): ILocation
    {
        return this._location;
    }

    //////////
    // CRUD //
    //////////

    public static async create(data: ICreateVehicle): Promise<Vehicle>
    {
        const id = Utilities.id(Config.ID_PREFIXES.VEHICLE);

        await Database.pool
            .query(
                `
                insert into "vehicles"
                    ("id", "battery_level", "location")
                values
                    ($1, $2, $3)
                `,
                [
                    id,
                    data.battery_level,
                    Utilities.formatLocationForDatabase(data.location),
                ],
            )
            .catch(() =>
            {
                throw Boom.badRequest();
            });

        return Vehicle.deserialize({
            id,
            battery_level: data.battery_level,
            location: `${data.location.longitude};${data.location.latitude}`,
            available: true,
        });
    }

    public static async retrieve(id: string): Promise<Vehicle>
    {
        const result = await Database.pool
            .query(
                `
                select "id", "battery_level", "location", "available"
                from "v_vehicles"
                where "id" = $1
                `,
                [ id ],
            );

        if (result.rowCount === 0)
        {
            throw Boom.notFound();
        }

        return Vehicle.deserialize(result.rows[0]);
    }

    public async update(data: IUpdateVehicle): Promise<void>
    {
        this._battery_level = data.battery_level ?? this.battery_level;
        this._location = data.location ?? this.location;

        await Database.pool
            .query(
                `
                update "vehicles"
                set
                    "battery_level" = $1,
                    "location" = $2
                where
                    "id" = $3
                `,
                [
                    this.battery_level,
                    Utilities.formatLocationForDatabase(this.location),
                    this.id,
                ],
            )
            .catch(() =>
            {
                throw Boom.badRequest();
            });
    }

    public async delete(): Promise<void>
    {
        await Database.pool
            .query(
                `delete from "vehicles" where "id" = $1`,
                [ this.id, ],
            );
    }

    ///////////////
    // UTILITIES //
    ///////////////

    public static async retrieveMultiple(options: {
        location: ILocation,
        /**
         * The radius in meters
         */
        radius: number,
    }): Promise<Vehicle[]>
    {
        const result = await Database.pool
            .query(
                `
                select "id", "battery_level", "location", "available"
                from "v_vehicles"
                where st_dwithin("postgis_location", $1, $2)
                `,
                [
                    Utilities.formatLocationForDatabase(options.location),
                    options.radius,
                ],
            );

        return result.rows.map(Vehicle.deserialize);
    }

    ///////////////////
    // SERIALIZATION //
    ///////////////////

    public serialize(): ISerializedVehicle
    {
        return {
            id: this.id,
            battery_level: this.battery_level,
            location: this.location,
            available: this.available,
        };
    }

    private static deserialize(data: IDatabaseVehicle): Vehicle
    {
        return new Vehicle(
            data.id,
            data.battery_level,
            Utilities.parseLocationFromDatabase(data.location),
            data.available,
        );
    }

    /////////////
    // SCHEMAS //
    /////////////

    public static readonly SCHEMA = {
        OBJ: Joi.object({
            id: Schema.ID.VEHICLE.required(),
            battery_level: Joi.number().integer().min(0).max(100).required(),
            location: Schema.LOCATION.required(),
            available: Schema.BOOLEAN.required(),
        }),
        CREATE: Joi.object({
            battery_level: Joi.number().integer().min(0).max(100).required(),
            location: Schema.LOCATION.required(),
        }),
        UPDATE: Joi.object({
            battery_level: Joi.number().integer().min(0).max(100).optional(),
            location: Schema.LOCATION.optional(),
        }),
    } as const;
}
