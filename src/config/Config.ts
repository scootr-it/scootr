import Stripe from "stripe";

export class Config
{
    public static readonly IS_PRODUCTION = process.env.NODE_ENV === "production";

    public static readonly ID_PREFIXES = {
        USER: "usr",
        WALLET: "wlt",
        PAYMENT_METHOD: "pmt",
        VEHICLE: "vcl",
        RIDE: "rid",
        SESSION: "ses",
        RIDE_WAYPOINT: "rwp",
        TRANSACTION: "trx",
        SUBSCRIPTION: "sub",
        EXPORT: "exp",
    } as const;

    public static readonly ID_BYTE_LENGTH = 30;

    /**
     * @default
     * 
     * 30 days
     */
    public static readonly SESSION_DURATION = 60 * 60 * 24 * 30;

    /**
     * @default
     * 
     * 7 days
     */
    public static readonly EXPORT_EXPIRES_AFTER = 60 * 60 * 24 * 7;

    public static readonly MIN_CHARGE_AMOUNT = 1;

    public static readonly RIDE_FIXED_COST = 1;
    public static readonly RIDE_COST_PER_MINUTE = 0.2;
    public static readonly WALLET_MIN_BALANCE_TO_START_RIDE = 5;

    public static readonly STRIPE = new Stripe(process.env.STRIPE_SECRET_API_KEY ?? "", { apiVersion: "2020-08-27" });

    public static readonly API_HOST = Config.IS_PRODUCTION
        ? "https://api.scootr.it"
        : `http://localhost:${process.env.PORT}`;

    public static readonly CLIENT_HOST = Config.IS_PRODUCTION
        ? "https://scootr.it"
        : "https://localhost:4200";

}