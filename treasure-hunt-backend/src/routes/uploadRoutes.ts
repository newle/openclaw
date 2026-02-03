import { Router } from "express";
import multer from "multer";
import { uploadFile } from "../controllers/uploadController.js";

const router = Router();

// Configure multer for memory storage (buffer)
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

router.post("/", upload.single("file"), uploadFile);

export default router;
