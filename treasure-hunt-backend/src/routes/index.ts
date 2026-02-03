import { Router } from "express";
import gameRoutes from "./gameRoutes.js";
import uploadRoutes from "./uploadRoutes.js";

const router = Router();

router.get("/", (req, res) => {
  res.json({ message: "Welcome to Treasure Hunt API" });
});

router.use("/game", gameRoutes);
router.use("/upload", uploadRoutes);

export default router;
