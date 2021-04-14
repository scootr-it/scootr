import Boom from "@hapi/boom";
import { differenceInMinutes } from "date-fns";
import Joi from "joi";
import { ILocation } from "../common/ILocation";
import { Config } from "../config/Config";
import { Schema } from "../config/Schema";
import Database from "../utilities/Database";
import { Utilities } from "../utilities/Utilities";
import { ISerializedUser, User } from "./User";
import { ISerializedVehicle, Vehicle } from "./Vehicle";
import { ISerializedWallet, Wallet } from "./Wallet";

interface IDatabaseRide
{
    id: string,
    user: string,
    vehicle: string,
    wallet: string,
    start_time: Date,
    end_time: Date | null,
    start_location: string,
    end_location: string | null,
    amount: number | null,
}

interface ICreateRide
{
    vehicle: string,
    wallet: string,
}

export interface ISerializedRide
{
    id: string,
    user: ISerializedUser,
    vehicle: ISerializedVehicle,
    wallet: ISerializedWallet,
    start_time: string,
    end_time: string | null,
    start_location: ILocation,
    end_location: ILocation | null,
    amount: number | null,
}

export class Ride
{
    private constructor
    (
        public readonly id: string,
        public readonly user: User,
        public readonly vehicle: Vehicle,
        public readonly wallet: Wallet,
        public readonly start_time: Date,
        public readonly end_time: Date | null,
        public readonly start_location: ILocation,
        public readonly end_location: ILocation | null,
        public readonly amount: number | null,
    )
    {}

    //////////
    // CRUD //
    //////////

    public static async create(data: ICreateRide, user: User): Promise<Ride>
    {
        const activeRidesResult = await Database.pool
            .query(
                `
                select "id"
                from "rides"
                where
                    "user" = $1
                    and
                    "end_time" is null
                limit 1
                `,
                [ user.id ],
            );

        if (activeRidesResult.rowCount > 0)
        {
            throw Boom.conflict(undefined, [
                {
                    field: "ride",
                    error: "Non è possibile cominciare una nuova corsa in quanto ne esiste già una di attiva",
                },
            ]);
        }

        const vehicle = await Vehicle.retrieve(data.vehicle);
        const wallet = await Wallet.retrieve(data.wallet);

        if (wallet.balance < Config.WALLET_MIN_BALANCE_TO_START_RIDE)
        {
            throw Boom.forbidden(undefined, [
                {
                    field: "wallet",
                    error: `Non è possibile utilizzare il portafoglio '${wallet.name}' in quanto non ha saldo a sufficienza (minimo ${Config.WALLET_MIN_BALANCE_TO_START_RIDE}€)`,
                },
            ]);
        }

        const id = Utilities.id(Config.ID_PREFIXES.RIDE);
        const startTime = new Date();

        await Database.pool
            .query(
                `
                insert into "rides"
                    ("id", "user", "vehicle", "wallet", "start_time", "start_location")
                values
                    ($1, $2, $3, $4, $5, $6)
                returning *
                `,
                [
                    id,
                    user.id,
                    data.vehicle,
                    data.wallet,
                    startTime.toISOString(),
                    vehicle.location,
                ],
            )
            .catch(() =>
            {
                throw Boom.badRequest();
            });

        return Ride.deserialize({
            id,
            user: user.id,
            vehicle: data.vehicle,
            wallet: data.wallet,
            start_time: startTime,
            start_location: `${vehicle.location.longitude};${vehicle.location.latitude}`,
            end_time: null,
            end_location: null,
            amount: null,
        });
    }

    public static async retrieve(id: string): Promise<Ride>
    {
        const result = await Database.pool
            .query(
                `select * from "v_rides" where "id" = $1`,
                [ id ],
            );

        if (result.rowCount === 0)
        {
            throw Boom.notFound();
        }

        return Ride.deserialize(result.rows[0]);
    }

    ///////////////
    // UTILITIES //
    ///////////////

    public static async forUser(user: User): Promise<Ride[]>
    {
        const result = await Database.pool
            .query(
                `select * from "rides" where "user" = $1`,
                [ user.id ],
            );

        return Promise.all(result.rows.map(Ride.deserialize));
    }

    public async end(location: ILocation): Promise<void>
    {
        const endTime = new Date();

        const amount = Config.RIDE_FIXED_COST
            + (differenceInMinutes(endTime, this.start_time) * Config.RIDE_COST_PER_MINUTE);

        if (amount < Config.RIDE_FIXED_COST)
        {
            throw Boom.forbidden();
        }

        const client = await Database.pool.connect();

        await client.query("begin");

        await client
            .query(
                `
                update "wallets"
                set
                    "balance" = "balance" - $1
                where
                    "id" = $2
                `,
                [
                    amount,
                    this.wallet.id,
                ],
            )
            .catch(async () =>
            {
                await client.query("rollback");

                throw Boom.badImplementation();
            });

        await client
            .query(
                `
                update "rides"
                set
                    "end_time" = $1,
                    "end_location" = $2
                    "amount" = $3
                where
                    "id" = $4
                `,
                [
                    endTime.toISOString(),
                    Utilities.formatLocationForDatabase(location),
                    amount,
                    this.id,
                ],
            )
            .catch(async () =>
            {
                await client.query("rollback");

                throw Boom.badImplementation();
            });

        await client.query("commit");

        client.release();
    }

    ///////////////////
    // SERIALIZATION //
    ///////////////////

    public serialize(): ISerializedRide
    {
        return {
            id: this.id,
            user: this.user.serialize(),
            vehicle: this.vehicle.serialize(),
            wallet: this.wallet.serialize(),
            start_time: this.start_time.toISOString(),
            end_time: this.end_time?.toISOString() ?? null,
            start_location: this.start_location,
            end_location: this.end_location,
            amount: this.amount,
        };
    }

    private static async deserialize(data: IDatabaseRide): Promise<Ride>
    {
        const user = await User.retrieve(data.user);
        const vehicle = await Vehicle.retrieve(data.vehicle);
        const wallet = await Wallet.retrieve(data.wallet);

        return new Ride(
            data.id,
            user,
            vehicle,
            wallet,
            data.start_time,
            data.end_time,
            Utilities.parseLocationFromDatabase(data.start_location),
            data.end_location
                ? Utilities.parseLocationFromDatabase(data.end_location)
                : null,
            data.amount,
        );
    }

    /////////////
    // SCHEMAS //
    /////////////

    public static readonly SCHEMA = {
        OBJ: Joi.object({
            id: Schema.ID.RIDE.required(),
            user: User.SCHEMA.OBJ.required(),
            vehicle: Vehicle.SCHEMA.OBJ.required(),
            wallet: Wallet.SCHEMA.OBJ.required(),
            start_time: Schema.DATETIME.required(),
            end_time: Schema.DATETIME.allow(null).required(),
            start_location: Schema.LOCATION.required(),
            end_location: Schema.LOCATION.allow(null).required(),
            amount: Schema.MONEY.allow(null).required(),
        }),
        CREATE: Joi.object({
            vehicle: Schema.ID.VEHICLE.required(),
            wallet: Schema.ID.WALLET.required(),
        }),
    } as const;
}
