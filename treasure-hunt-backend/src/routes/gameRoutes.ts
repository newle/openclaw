import { Router } from "express";
import { verifyLocation, createTreasure, getTreasures, getTreasureDetail, getTreasureProgress, startGame } from "../controllers/gameController.js";

const router = Router();

router.get("/", getTreasures);
router.get("/:id", getTreasureDetail);
router.get("/:id/progress", getTreasureProgress);
router.post("/create", createTreasure);
router.post("/start", startGame);
router.post("/verify-location", verifyLocation);

export default router;
