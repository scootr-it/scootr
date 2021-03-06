import Boom from "@hapi/boom";
import { ServerRoute } from "@hapi/hapi";
import Joi from "joi";
import { Schema } from "../../config/Schema";
import { Ride } from "../../models/Ride";
import { RideWaypoint } from "../../models/RideWaypoint";
import { User } from "../../models/User";
import { Vehicle } from "../../models/Vehicle";

export default <ServerRoute[]>[
    {
        method: "GET",
        path: "/rides/{id}",
        options: {
            validate: {
                params: Joi.object({
                    id: Schema.ID.RIDE.required(),
                }),
            },
            response: {
                schema: Ride.SCHEMA.OBJ,
            },
        },
        handler: async (request, h) =>
        {
            const authenticatedUser = request.auth.credentials.user as User;

            const ride = await Ride.retrieve(request.params.id);

            if (authenticatedUser.id !== ride.wallet.user.id)
            {
                throw Boom.forbidden();
            }

            return ride.serialize();
        },
    },
    {
        method: "GET",
        path: "/rides/{id}/waypoints",
        options: {
            validate: {
                params: Joi.object({
                    id: Schema.ID.RIDE.required(),
                }),
            },
            response: {
                schema: Schema.ARRAY(RideWaypoint.SCHEMA.OBJ),
            },
        },
        handler: async (request, h) =>
        {
            const authenticatedUser = request.auth.credentials.user as User;

            const ride = await Ride.retrieve(request.params.id);

            if (authenticatedUser.id !== ride.wallet.user.id)
            {
                throw Boom.forbidden();
            }

            const waypoints = await RideWaypoint.forRide(ride);

            return waypoints.map(_ => _.serialize());
        },
    },
    {
        method: "GET",
        path: "/users/{id}/rides",
        options: {
            validate: {
                params: Joi.object({
                    id: Schema.ID.USER.required(),
                }),
            },
            response: {
                schema: Schema.ARRAY(Ride.SCHEMA.OBJ),
            },
        },
        handler: async (request, h) =>
        {
            const authenticatedUser = request.auth.credentials.user as User;

            if (authenticatedUser.id !== request.params.id)
            {
                throw Boom.forbidden();
            }

            const rides = await Ride.forUser(authenticatedUser);

            return rides.map(_ => _.serialize());
        },
    },
    {
        method: "GET",
        path: "/users/{id}/rides/active",
        options: {
            validate: {
                params: Joi.object({
                    id: Schema.ID.USER.required(),
                }),
            },
            response: {
                schema: Schema.NULLABLE(Ride.SCHEMA.OBJ),
            },
        },
        handler: async (request, h) =>
        {
            const authenticatedUser = request.auth.credentials.user as User;

            if (authenticatedUser.id !== request.params.id)
            {
                throw Boom.forbidden();
            }

            const ride = await Ride.retrieveActive(authenticatedUser);

            if (!ride)
            {
                return null;
            }

            return ride.serialize();
        },
    },
    {
        method: "POST",
        path: "/rides",
        options: {
            validate: {
                payload: Ride.SCHEMA.CREATE,
            },
            response: {
                schema: Ride.SCHEMA.OBJ,
            },
        },
        handler: async (request, h) =>
        {
            const authenticatedUser = request.auth.credentials.user as User;

            const ride = await Ride.create(request.payload as any, authenticatedUser);

            return ride.serialize();
        },
    },
    {
        method: "POST",
        path: "/rides/{id}/end",
        options: {
            validate: {
                params: Joi.object({
                    id: Schema.ID.RIDE.required(),
                }),
            },
            response: {
                schema: Ride.SCHEMA.OBJ,
            },
        },
        handler: async (request, h) =>
        {
            const authenticatedUser = request.auth.credentials.user as User;

            const ride = await Ride.retrieve(request.params.id);

            if (authenticatedUser.id !== ride.wallet.user.id)
            {
                throw Boom.forbidden();
            }

            await ride.end();

            return ride.serialize();
        },
    },
    {
        method: "POST",
        path: "/rides/{id}/waypoints",
        options: {
            auth: {
                scope: [ "vehicle" ],
            },
            validate: {
                params: Joi.object({
                    id: Schema.ID.RIDE.required(),
                }),
                /**
                 * This route accepts an array because in order
                 * to reduce network traffic vehicles only send
                 * updated waypoint data in bulk
                 */
                payload: Schema.ARRAY(RideWaypoint.SCHEMA.CREATE),
            },
        },
        handler: async (request, h) =>
        {
            const authenticatedVehicle = request.auth.credentials.user as Vehicle;

            const ride = await Ride.retrieve(request.params.id);

            if (authenticatedVehicle.id !== ride.vehicle.id)
            {
                throw Boom.forbidden();
            }

            await ride.addWaypoints(request.payload as any);

            return h.response();
        },
    },
];
