import { Router } from "express";
import { isAuthenticated } from "../middleware";


const router = Router();



router.get("/me", async (req, res) => {
  // Session is already available from middleware via req.session
  return res.status(200).json((req as any).session);
});

export default router;