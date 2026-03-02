import { fromNodeHeaders } from "better-auth/node";
import { Router } from "express";
import { auth } from "../auth"; // Your Better Auth instance

const router = Router();

router.get("/me", async (req, res) => {
 	const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
	return res.status(200).json(session);
});

export default router;