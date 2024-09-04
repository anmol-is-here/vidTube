import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();

app.use(
    cors({
        origin: process.env.CORS_ORIGIN,
        credentials: true
    })
)

// commom middleware

app.use(express.json({limit: "16kb"}))
app.use(express.urlencoded({extended: true, limit: "16kb"}))
app.use(express.static("public"))
app.use(cookieParser())

// import routers
import healthcheckRouter from "./routes/healthcheck.routes.js"
import userRoute from "./routes/user.routes.js"

// route
app.use("/api/v1/healthcheck", healthcheckRouter)
app.use("/api/v1/users", userRoute)


export { app }