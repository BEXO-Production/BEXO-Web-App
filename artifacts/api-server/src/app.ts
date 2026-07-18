import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { subdomainRouter } from "./middlewares/subdomainRouter";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// Subdomain Gateway Router MUST come before other routes
app.use(subdomainRouter);

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "BEXO API Server is running.",
    frontendUrl: "http://localhost:5173"
  });
});

app.use("/api", router);

export default app;
