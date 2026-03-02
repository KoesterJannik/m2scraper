import express from "express";
import cors from "cors";
import { auth } from "./auth";
import { toNodeHandler } from "better-auth/node";
import { config } from "./config";
import usersRouter from "./router/users.router";
const app = express();

// Apply CORS middleware BEFORE routes
app.use(cors({
    origin: config.frontendUrl as string, // Replace with your frontend's origin
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Include OPTIONS for preflight
    credentials: true, // Allow credentials (cookies, authorization headers, etc.)
}));

app.use(express.json());

// Better Auth routes
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use("/api/users", usersRouter);
export default app;