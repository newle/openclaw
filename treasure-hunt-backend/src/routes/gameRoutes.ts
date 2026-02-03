import { Router } from "express";
import { verifyLocation, createTreasure, getTreasures, getTreasureDetail, getTreasureProgress, startGame, joinByCode, regenerateCode } from "../controllers/gameController.js";

const router = Router();

router.get("/", getTreasures);
router.post("/join-code", joinByCode); // New endpoint for joining via code
router.post("/regenerate-code", regenerateCode); // New endpoint for regenerating code
router.get("/:id", getTreasureDetail);
router.get("/:id/progress", getTreasureProgress);
router.post("/create", createTreasure);
router.post("/start", startGame);
router.post("/verify-location", verifyLocation);

export default router;
